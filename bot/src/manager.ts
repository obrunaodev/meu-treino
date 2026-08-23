import makeWASocket, {
  Browsers, DisconnectReason, type ConnectionState, type WASocket, type WAMessage,
} from '@whiskeysockets/baileys'
import QRCode from 'qrcode'
import { pool } from './db.js'
import { clearAuthState, postgresAuthState } from './auth-state.js'
import { editedMessage, editReviewMessage, helpMessage, lastWorkoutMessage, parserHelp, savedMessage, skippedMessage, todayMessage, weeklyHistoryMessage, workoutMessage } from './messages.js'
import { hasLinkOption, parseBotCommand, parseEditEntry, parseExerciseEntry, parseSkipEntry } from './parser.js'
import { previewTodayWorkout, recordExercise, skipExercise, startTodayWorkout } from './workout.js'
import { editableWorkoutReview, editTargetWorkout, endOpenWorkout, openWorkoutReview } from './workout-history.js'
import { clearTrackedMessages, trackGroupMessage } from './chat-cleaner.js'
import { weeklyHistory } from './weekly-history.js'

export interface BotStatus {
  state: 'disconnected' | 'connecting' | 'qr' | 'connected'
  qrDataUrl: string | null
  phone: string | null
  selectedGroupJid: string | null
  selectedGroupName: string | null
}

const sockets = new Map<string, WASocket>()
const statuses = new Map<string, BotStatus>()
const intentionalClose = new Set<string>()
const sentMessageIds = new Set<string>()

export function statusFor(ownerId: string): BotStatus {
  return statuses.get(ownerId) ?? {
    state: 'disconnected', qrDataUrl: null, phone: null,
    selectedGroupJid: null, selectedGroupName: null,
  }
}

/** Abre ou reaproveita o socket de um usuário e publica o QR no estado HTTP. */
export async function connectOwner(ownerId: string) {
  if (sockets.has(ownerId)) return statusFor(ownerId)
  const { state, saveCreds } = await postgresAuthState(ownerId)
  const selected = await selectedGroup(ownerId)
  statuses.set(ownerId, { state: 'connecting', qrDataUrl: null, phone: null, ...selected })

  const socket = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu('Meu Treino'),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  })
  sockets.set(ownerId, socket)
  socket.ev.on('creds.update', saveCreds)
  socket.ev.on('connection.update', (update) => void handleConnection(ownerId, update))
  socket.ev.on('messages.upsert', ({ messages }) => {
    void handleMessages(ownerId, messages).catch(console.error)
  })
  return statusFor(ownerId)
}

export async function groupsFor(ownerId: string) {
  const socket = sockets.get(ownerId)
  if (!socket || statusFor(ownerId).state !== 'connected') return []
  const groups = await socket.groupFetchAllParticipating()
  return Object.values(groups).map((group) => ({ jid: group.id, name: group.subject, size: group.size ?? group.participants.length }))
}

export async function chooseGroup(ownerId: string, jid: string, name: string) {
  await pool.query(`insert into whatsapp_settings (owner_id,selected_group_jid,selected_group_name)
    values ($1,$2,$3) on conflict (owner_id) do update set selected_group_jid=$2,selected_group_name=$3,updated_at=now()`, [ownerId, jid, name])
  statuses.set(ownerId, { ...statusFor(ownerId), selectedGroupJid: jid, selectedGroupName: name })
}

export async function disconnectOwner(ownerId: string) {
  intentionalClose.add(ownerId)
  const socket = sockets.get(ownerId)
  sockets.delete(ownerId)
  if (socket) await socket.logout().catch(() => undefined)
  await clearAuthState(ownerId)
  await pool.query(`update whatsapp_settings set connected_at=null,updated_at=now() where owner_id=$1`, [ownerId])
  statuses.set(ownerId, { ...statusFor(ownerId), state: 'disconnected', qrDataUrl: null, phone: null })
}

export async function restoreConnections() {
  const { rows } = await pool.query(`select owner_id from whatsapp_settings where connected_at is not null`)
  await Promise.all(rows.map((row) => connectOwner(row.owner_id)))
}

async function handleConnection(ownerId: string, update: Partial<ConnectionState>) {
  if (update.qr) {
    const qrDataUrl = await QRCode.toDataURL(update.qr, { margin: 1, width: 320 })
    statuses.set(ownerId, { ...statusFor(ownerId), state: 'qr', qrDataUrl })
  }
  if (update.connection === 'open') {
    statuses.set(ownerId, { ...statusFor(ownerId), state: 'connected', qrDataUrl: null, phone: sockets.get(ownerId)?.user?.id ?? null })
    await pool.query(`insert into whatsapp_settings (owner_id,connected_at) values ($1,now()) on conflict (owner_id) do update set connected_at=now(),updated_at=now()`, [ownerId])
  }
  if (update.connection !== 'close') return
  sockets.delete(ownerId)
  if (intentionalClose.delete(ownerId)) return
  const code = (update.lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode
  if (code === DisconnectReason.loggedOut) {
    statuses.set(ownerId, { ...statusFor(ownerId), state: 'disconnected', qrDataUrl: null, phone: null })
    return
  }
  statuses.set(ownerId, { ...statusFor(ownerId), state: 'connecting', qrDataUrl: null })
  setTimeout(() => void connectOwner(ownerId), 1500)
}

async function handleMessages(ownerId: string, messages: WAMessage[]) {
  const socket = sockets.get(ownerId)
  const selected = statusFor(ownerId).selectedGroupJid
  if (!socket || !selected) return
  for (const message of messages) {
    const id = message.key.id
    if (!id || sentMessageIds.delete(id) || message.key.remoteJid !== selected) continue
    const text = messageText(message)
    if (!text) continue
    // Rastreia todo mundo, para o /clear alcançar a conversa inteira...
    await trackGroupMessage(ownerId, message.key, message.messageTimestamp)
    // ...mas só o dono comanda. O bot é dispositivo companheiro da conta dele,
    // então as mensagens dele chegam com `fromMe`. Sem esta linha, qualquer
    // participante do grupo registra treino, encerra a sessão com /end,
    // reescreve carga com /edit e lê o histórico na conta alheia.
    if (!message.key.fromMe) continue

    try {
      await respond(ownerId, socket, selected, text)
    } catch (error) {
      // Falhar calado é o pior desfecho: quem digitou não sabe se registrou.
      console.error(error)
      await send(ownerId, socket, selected, '⚠️ Não consegui registrar isso. Confira os números e tente de novo.')
        .catch(() => undefined)
    }
  }
}

async function respond(ownerId: string, socket: WASocket, jid: string, text: string) {
  const command = parseBotCommand(text)
  if (command?.command === 'clear') {
    const result = await clearTrackedMessages(ownerId, socket, jid)
    if (result.failed > 0) {
      return send(ownerId, socket, jid, `⚠️ Apaguei ${result.cleared} mensagens. ${result.failed} mensagens antigas não puderam ser removidas pelo WhatsApp.`)
    }
    return
  }
  if (command?.command === 'start') {
    const workout = await startTodayWorkout(ownerId)
    return send(ownerId, socket, jid, workout
      ? workoutMessage(workout, { includeLinks: hasLinkOption(command.args) })
      : '⚠️ Nenhum treino configurado no programa ativo.')
  }
  if (command?.command === 'today') {
    const workout = await previewTodayWorkout(ownerId)
    const review = workout?.alreadyStarted ? await openWorkoutReview(ownerId) : null
    return send(ownerId, socket, jid, workout
      ? todayMessage(workout, { includeLinks: hasLinkOption(command.args) }, review)
      : '⚠️ Nenhum treino configurado no programa ativo.')
  }
  if (command?.command === 'history') {
    return send(ownerId, socket, jid, weeklyHistoryMessage(await weeklyHistory(ownerId)))
  }
  if (command?.command === 'help') {
    return send(ownerId, socket, jid, helpMessage(await openWorkoutReview(ownerId)))
  }
  if (command?.command === 'last') {
    const review = await editableWorkoutReview(ownerId)
    return send(ownerId, socket, jid, review ? lastWorkoutMessage(review) : 'ℹ️ Ainda não há sessão registrada.')
  }
  if (command?.command === 'end') {
    const ended = await endOpenWorkout(ownerId)
    return send(ownerId, socket, jid, ended ? '🏁 Treino encerrado como *incompleto*. O histórico foi preservado.' : 'ℹ️ Não há treino em andamento para encerrar.')
  }
  if (command?.command === 'skip') {
    const skippedNumber = parseSkipEntry(text)
    if (skippedNumber === null) return send(ownerId, socket, jid, '⚠️ Informe o exercício. Use: `/skip 3` ou `/pular 3`.')
    const result = await skipExercise(ownerId, skippedNumber)
    if (result.status === 'no_session') return send(ownerId, socket, jid, 'ℹ️ O comando */skip* só funciona durante um treino. Comece com */start*.')
    if (result.status === 'bad_exercise') return send(ownerId, socket, jid, `O treino atual tem exercícios de 1 a ${result.count}.`)
    if (result.status === 'already_logged') return send(ownerId, socket, jid, `ℹ️ *${result.item.name}* já foi registrado nesta sessão.`)
    if (result.status === 'already_skipped') return send(ownerId, socket, jid, `ℹ️ *${result.item.name}* já está marcado como pulado.`)
    return send(ownerId, socket, jid, skippedMessage(skippedNumber, result.item, result.finished))
  }
  if (command?.command === 'edit') return respondToEdit(ownerId, socket, jid, command.args)
  const parsed = parseExerciseEntry(text)
  if (!parsed.ok) return /^\s*\d/.test(text) ? send(ownerId, socket, jid, parserHelp(parsed.reason)) : undefined
  const result = await recordExercise(ownerId, parsed.value)
  if (result.status === 'no_session') return send(ownerId, socket, jid, 'Comece primeiro com */start*.')
  if (result.status === 'bad_exercise') return send(ownerId, socket, jid, `O treino atual tem exercícios de 1 a ${result.count}.`)
  if (result.status === 'already_logged') return send(ownerId, socket, jid, `ℹ️ *${result.item.name}* já foi registrado nesta sessão.`)
  return send(ownerId, socket, jid, savedMessage(parsed.value.exerciseNumber, result.item, parsed.value, result.finished))
}

async function respondToEdit(ownerId: string, socket: WASocket, jid: string, args: string) {
  if (!args) {
    const review = await editableWorkoutReview(ownerId)
    return send(ownerId, socket, jid, review ? editReviewMessage(review) : 'ℹ️ Ainda não há sessão para editar.')
  }
  const parsed = parseEditEntry(args)
  if (!parsed.ok) return send(ownerId, socket, jid, `⚠️ Não entendi a edição.\nUse: \`/edit 1 70kg 3x15 3r\``)
  const result = await editTargetWorkout(ownerId, parsed.value)
  if (result.status === 'no_history') return send(ownerId, socket, jid, 'ℹ️ Ainda não há sessão para editar.')
  if (result.status === 'bad_exercise') return send(ownerId, socket, jid, `O último treino tem exercícios de 1 a ${result.count}.`)
  return send(ownerId, socket, jid, editedMessage(parsed.value.exerciseNumber, result.item.name, parsed.value, result.item.loadPerSide))
}

async function send(ownerId: string, socket: WASocket, jid: string, text: string) {
  // As mensagens de treino já trazem a URL legível; não precisamos importar
  // metadados do YouTube nem gerar uma segunda miniatura no VPS de 1 GB.
  const sent = await socket.sendMessage(jid, { text, linkPreview: null })
  if (sent?.key.id) {
    sentMessageIds.add(sent.key.id)
    await trackGroupMessage(ownerId, sent.key, sent.messageTimestamp)
  }
}

function messageText(message: WAMessage) {
  return message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? null
}

async function selectedGroup(ownerId: string) {
  const { rows } = await pool.query(`select selected_group_jid,selected_group_name from whatsapp_settings where owner_id=$1`, [ownerId])
  return { selectedGroupJid: rows[0]?.selected_group_jid ?? null, selectedGroupName: rows[0]?.selected_group_name ?? null }
}
