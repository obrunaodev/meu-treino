import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'

/**
 * O fechamento automático é a única escrita que o servidor faz sozinho nos
 * dados do usuário. Se ele errar a janela, fecha treino que está acontecendo.
 */

const DB = process.env.DATABASE_URL ?? 'postgres://treino:change-me@localhost:5432/treino'
const pool = new pg.Pool({ connectionString: DB })

const reachable = await pool.query('select 1').then(() => true).catch(() => false)
const suite = reachable ? describe : describe.skip

const HOURS = 60 * 60 * 1000

suite('closeStaleSessions', () => {
  let ownerId = ''
  let programId = ''
  let templateId = ''
  let closeStaleSessions: (now?: Date) => Promise<number>

  beforeEach(async () => {
    ;({ closeStaleSessions } = await import('../../src/jobs/index.js'))

    const { rows } = await pool.query(
      `insert into users (google_sub, email, name) values ('vitest-jobs','jobs@exemplo.com','Jobs')
       on conflict (google_sub) do update set email = excluded.email returning id`,
    )
    ownerId = rows[0].id
    await pool.query('delete from set_logs where owner_id=$1', [ownerId])
    await pool.query('delete from workout_sessions where owner_id=$1', [ownerId])

    programId = randomUUID()
    templateId = randomUUID()
    await pool.query(
      `insert into programs (id, owner_id, name) values ($1,$2,'P') on conflict do nothing`,
      [programId, ownerId],
    )
    await pool.query(
      `insert into templates (id, owner_id, program_id, position, name)
       values ($1,$2,$3,0,'A') on conflict do nothing`,
      [templateId, ownerId, programId],
    )
  })

  afterAll(async () => {
    await pool.query('delete from set_logs where owner_id=$1', [ownerId])
    await pool.query('delete from workout_sessions where owner_id=$1', [ownerId])
    await pool.query('delete from templates where owner_id=$1', [ownerId])
    await pool.query('delete from programs where owner_id=$1', [ownerId])
    await pool.query("delete from users where google_sub='vitest-jobs'")
  })

  const openSession = async (startedAt: Date) => {
    const id = randomUUID()
    await pool.query(
      `insert into workout_sessions (id, owner_id, program_id, template_id, status, started_at)
       values ($1,$2,$3,$4,'em_andamento',$5)`,
      [id, ownerId, programId, templateId, startedAt],
    )
    return id
  }

  const logSet = async (sessionId: string, completedAt: Date) => {
    await pool.query(
      `insert into set_logs (id, owner_id, session_id, exercise_id, set_index, completed_at)
       values ($1,$2,$3,$4,0,$5)`,
      [randomUUID(), ownerId, sessionId, randomUUID(), completedAt],
    )
  }

  const statusOf = async (id: string) => {
    const { rows } = await pool.query(
      'select status, auto_closed_at, ended_at from workout_sessions where id=$1', [id],
    )
    return rows[0]
  }

  it('fecha sessão sem nenhum registro parada há mais de 6h', async () => {
    const now = new Date()
    const id = await openSession(new Date(now.getTime() - 7 * HOURS))

    await closeStaleSessions(now)

    const row = await statusOf(id)
    expect(row.status).toBe('incompleta')
    expect(row.auto_closed_at).not.toBeNull()
  })

  it('não fecha sessão parada há menos de 6h', async () => {
    const now = new Date()
    const id = await openSession(new Date(now.getTime() - 5 * HOURS))

    await closeStaleSessions(now)

    expect((await statusOf(id)).status).toBe('em_andamento')
  })

  it('sessão longa mas ATIVA sobrevive — a janela conta da última série', async () => {
    const now = new Date()
    const id = await openSession(new Date(now.getTime() - 10 * HOURS))
    await logSet(id, new Date(now.getTime() - 20 * 60 * 1000))

    await closeStaleSessions(now)

    expect((await statusOf(id)).status).toBe('em_andamento')
  })

  it('sessão com série antiga fecha, e o fim é a hora da última série', async () => {
    const now = new Date()
    const id = await openSession(new Date(now.getTime() - 12 * HOURS))
    const lastSet = new Date(now.getTime() - 8 * HOURS)
    await logSet(id, lastSet)

    await closeStaleSessions(now)

    const row = await statusOf(id)
    expect(row.status).toBe('incompleta')
    // Marcar o fim como "agora" inventaria 8h de treino que não aconteceram.
    expect(new Date(row.ended_at).getTime()).toBeCloseTo(lastSet.getTime(), -3)
  })

  it('não toca em sessão já concluída', async () => {
    const id = await openSession(new Date(Date.now() - 20 * HOURS))
    await pool.query("update workout_sessions set status='concluida' where id=$1", [id])

    await closeStaleSessions()

    const row = await statusOf(id)
    expect(row.status).toBe('concluida')
    expect(row.auto_closed_at).toBeNull()
  })

  it('rodar duas vezes não refaz o trabalho', async () => {
    await openSession(new Date(Date.now() - 9 * HOURS))
    expect(await closeStaleSessions()).toBe(1)
    expect(await closeStaleSessions()).toBe(0)
  })
})

/**
 * A linha da mídia fica para sempre (é o soft delete que ensina o cliente
 * offline que ela sumiu), mas os dois WebP no bucket, não. Sem esta limpeza o
 * disco da VPS enche com foto que ninguém mais consegue ver.
 */
suite('purgeDeletedMedia', () => {
  let ownerId = ''
  let exerciseId = ''
  let purgeDeletedMedia: (now?: Date) => Promise<number>
  let putObject: (key: string, body: Buffer, contentType: string) => Promise<void>
  let objectExists: (key: string) => Promise<boolean>

  const DAYS = 24 * HOURS

  const media = async (deletedAgoMs: number | null) => {
    const id = randomUUID()
    const prefix = `users/${ownerId}/exercises/${exerciseId}/${id}`
    await putObject(`${prefix}.webp`, Buffer.from('cheio'), 'image/webp')
    await putObject(`${prefix}.thumb.webp`, Buffer.from('thumb'), 'image/webp')
    await pool.query(
      `insert into exercise_media (id, owner_id, exercise_id, s3_key, thumb_key, mime, bytes, deleted_at)
       values ($1,$2,$3,$4,$5,'image/webp',5,$6)`,
      [id, ownerId, exerciseId, `${prefix}.webp`, `${prefix}.thumb.webp`,
        deletedAgoMs === null ? null : new Date(Date.now() - deletedAgoMs)],
    )
    return { id, s3Key: `${prefix}.webp`, thumbKey: `${prefix}.thumb.webp` }
  }

  beforeEach(async () => {
    ;({ purgeDeletedMedia } = await import('../../src/jobs/index.js'))
    const storage = await import('../../src/lib/storage.js')
    putObject = storage.putObject
    objectExists = async (key: string) =>
      storage.getObjectStream(key).then(() => true).catch(() => false)

    const { rows } = await pool.query(
      `insert into users (google_sub, email, name) values ('vitest-media','media@exemplo.com','Media')
       on conflict (google_sub) do update set email = excluded.email returning id`,
    )
    ownerId = rows[0].id
    await pool.query('delete from exercise_media where owner_id=$1', [ownerId])
    await pool.query('delete from exercises where owner_id=$1', [ownerId])

    exerciseId = randomUUID()
    await pool.query(
      `insert into exercises (id, owner_id, name) values ($1,$2,'Supino')`, [exerciseId, ownerId],
    )
  })

  afterAll(async () => {
    await pool.query('delete from exercise_media where owner_id=$1', [ownerId])
    await pool.query('delete from exercises where owner_id=$1', [ownerId])
    await pool.query("delete from users where google_sub='vitest-media'")
  })

  it('apaga os dois objetos da mídia removida além da carência', async () => {
    const alvo = await media(8 * DAYS)

    expect(await purgeDeletedMedia()).toBe(1)
    expect(await objectExists(alvo.s3Key)).toBe(false)
    expect(await objectExists(alvo.thumbKey)).toBe(false)
  })

  it('a linha continua no banco, para o cliente offline saber que sumiu', async () => {
    const alvo = await media(8 * DAYS)
    await purgeDeletedMedia()

    const { rows } = await pool.query(
      'select deleted_at, purged_at from exercise_media where id=$1', [alvo.id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].deleted_at).not.toBeNull()
    expect(rows[0].purged_at).not.toBeNull()
  })

  it('não toca no que ainda está dentro da carência', async () => {
    const recente = await media(1 * DAYS)

    expect(await purgeDeletedMedia()).toBe(0)
    expect(await objectExists(recente.s3Key)).toBe(true)
  })

  it('não toca no que não foi apagado', async () => {
    const viva = await media(null)

    expect(await purgeDeletedMedia()).toBe(0)
    expect(await objectExists(viva.s3Key)).toBe(true)
  })

  it('rodar de novo não repete trabalho', async () => {
    await media(8 * DAYS)
    expect(await purgeDeletedMedia()).toBe(1)
    expect(await purgeDeletedMedia()).toBe(0)
  })
})

/**
 * O lembrete só existe se mirar um horário. Antes ele não era nem agendado —
 * e, se fosse, mandaria a cada tick do dia, para quem tinha desligado o botão,
 * no fuso do container.
 */
suite('sendWorkoutReminders', () => {
  const TZ = 'America/Sao_Paulo'
  let ownerId = ''
  let programId = ''
  let sendWorkoutReminders: (now?: Date, timeZone?: string) => Promise<number>

  /** Um instante UTC a partir da hora LOCAL de São Paulo (UTC-3). */
  const local = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`)
  // 2026-08-25 é uma terça-feira.
  const TERCA = '2026-08-25'
  const QUARTA = '2026-08-26'

  const programa = async (patch: Record<string, unknown> = {}) => {
    const campos = {
      schedule_mode: 'weekly', weekdays: JSON.stringify([2]), workout_time: '19:00',
      reminder_lead_minutes: 60, is_active: true, ...patch,
    }
    await pool.query('delete from programs where owner_id=$1', [ownerId])
    programId = randomUUID()
    await pool.query(
      `insert into programs (id, owner_id, name, schedule_mode, weekdays, workout_time,
                             reminder_lead_minutes, is_active)
       values ($1,$2,'Força',$3,$4,$5,$6,$7)`,
      [programId, ownerId, campos.schedule_mode, campos.weekdays, campos.workout_time,
        campos.reminder_lead_minutes, campos.is_active],
    )
  }

  const lembretesLigados = (on: boolean) =>
    pool.query(`update user_settings set reminders_enabled=$2 where owner_id=$1`, [ownerId, on])

  const enviadoEm = async () => {
    const { rows } = await pool.query('select last_reminder_at from programs where id=$1', [programId])
    return rows[0]?.last_reminder_at as Date | null
  }

  beforeEach(async () => {
    ;({ sendWorkoutReminders } = await import('../../src/jobs/index.js'))
    const { rows } = await pool.query(
      `insert into users (google_sub, email, name) values ('vitest-rem','rem@exemplo.com','Rem')
       on conflict (google_sub) do update set email = excluded.email returning id`,
    )
    ownerId = rows[0].id
    await pool.query(
      `insert into user_settings (id, owner_id, reminders_enabled) values ($1,$2,true)
       on conflict (owner_id) do update set reminders_enabled=true`,
      [randomUUID(), ownerId],
    )
    await programa()
  })

  afterAll(async () => {
    await pool.query('delete from programs where owner_id=$1', [ownerId])
    await pool.query('delete from user_settings where owner_id=$1', [ownerId])
    await pool.query("delete from users where google_sub='vitest-rem'")
  })

  it('marca o envio no horário certo: antecedência antes do treino', async () => {
    // Treino 19:00, avisar 60 min antes -> 18:00 local.
    await sendWorkoutReminders(local(TERCA, '18:00'), TZ)
    expect(await enviadoEm()).not.toBeNull()
  })

  it('não dispara antes da hora', async () => {
    await sendWorkoutReminders(local(TERCA, '17:30'), TZ)
    expect(await enviadoEm()).toBeNull()
  })

  it('não dispara depois que a janela de tolerância passa', async () => {
    await sendWorkoutReminders(local(TERCA, '18:45'), TZ)
    expect(await enviadoEm()).toBeNull()
  })

  it('um restart em cima da hora ainda alcança dentro da tolerância', async () => {
    await sendWorkoutReminders(local(TERCA, '18:20'), TZ)
    expect(await enviadoEm()).not.toBeNull()
  })

  it('manda uma vez só, mesmo com o tick de 5 min rodando o dia todo', async () => {
    for (const hora of ['18:00', '18:05', '18:10', '18:15', '18:20']) {
      await sendWorkoutReminders(local(TERCA, hora), TZ)
    }
    const { rows } = await pool.query(
      'select last_reminder_at from programs where id=$1', [programId],
    )
    expect(rows[0].last_reminder_at).toEqual(local(TERCA, '18:00'))
  })

  it('volta a mandar no próximo dia de treino', async () => {
    await sendWorkoutReminders(local(TERCA, '18:00'), TZ)
    const primeiro = await enviadoEm()

    await pool.query(`update programs set weekdays=$2 where id=$1`, [programId, JSON.stringify([2, 3])])
    await sendWorkoutReminders(local(QUARTA, '18:00'), TZ)

    expect(await enviadoEm()).not.toEqual(primeiro)
  })

  it('respeita o botão desligado em Configurações', async () => {
    await lembretesLigados(false)
    await sendWorkoutReminders(local(TERCA, '18:00'), TZ)
    expect(await enviadoEm()).toBeNull()
  })

  it('ignora dia que não é de treino', async () => {
    await sendWorkoutReminders(local(QUARTA, '18:00'), TZ)
    expect(await enviadoEm()).toBeNull()
  })

  it('ignora programa contínuo, que não tem dia para mirar', async () => {
    await programa({ schedule_mode: 'continuous' })
    await sendWorkoutReminders(local(TERCA, '18:00'), TZ)
    expect(await enviadoEm()).toBeNull()
  })

  it('usa o fuso do usuário, não o do container', async () => {
    // 18:00 em São Paulo é 21:00 UTC. Lido como UTC, cairia fora da janela.
    const instante = local(TERCA, '18:00')
    expect(instante.getUTCHours()).toBe(21)

    await sendWorkoutReminders(instante, TZ)
    expect(await enviadoEm()).not.toBeNull()
  })

  it('antecedência maior que a hora do treino não vira aviso na véspera', async () => {
    await programa({ workout_time: '00:30', reminder_lead_minutes: 60 })
    await sendWorkoutReminders(local(TERCA, '00:00'), TZ)
    expect(await enviadoEm()).not.toBeNull()
  })
})

// O pool é do módulo inteiro: fechá-lo dentro de uma suíte derruba as
// seguintes, que ainda vão usá-lo.
afterAll(async () => {
  if (reachable) await pool.end()
})
