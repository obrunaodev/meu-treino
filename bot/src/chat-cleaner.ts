import type { WASocket, WAMessageKey } from '@whiskeysockets/baileys'
import { pool } from './db.js'

/** Guarda a chave mínima necessária para uma futura revogação no grupo. */
export async function trackGroupMessage(ownerId: string, key: WAMessageKey, timestamp: number | LongLike | null | undefined) {
  if (!key.remoteJid || !key.id) return
  const numericTimestamp = Number(timestamp)
  if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) return
  await pool.query(`insert into whatsapp_group_messages
    (owner_id,remote_jid,message_id,from_me,participant,message_timestamp)
    values ($1,$2,$3,$4,$5,$6) on conflict do nothing`,
  [ownerId, key.remoteJid, key.id, key.fromMe === true, key.participant ?? null, numericTimestamp])
}

/** Limpa o chat na conta vinculada e sincroniza a ação com seus dispositivos. */
export async function clearTrackedMessages(ownerId: string, socket: WASocket, jid: string) {
  const { rows } = await pool.query(`select remote_jid,message_id,from_me,participant,message_timestamp
    from whatsapp_group_messages where owner_id=$1 and remote_jid=$2
    order by message_timestamp desc limit 1`, [ownerId, jid])
  if (!rows[0]) return { cleared: 0, failed: 1 }

  await socket.chatModify({
    clear: true,
    // A chave torna o limite inclusivo: o próprio /clear some junto com tudo
    // que veio antes, em vez de permanecer como a última mensagem do chat.
    lastMessages: [{
      key: {
        remoteJid: rows[0].remote_jid,
        id: rows[0].message_id,
        fromMe: rows[0].from_me,
        participant: rows[0].participant ?? undefined,
      },
      messageTimestamp: Number(rows[0].message_timestamp),
    }],
  }, jid)
  const result = await pool.query(`delete from whatsapp_group_messages
    where owner_id=$1 and remote_jid=$2`, [ownerId, jid])
  return { cleared: result.rowCount ?? 0, failed: 0 }
}

interface LongLike { toString(): string }
