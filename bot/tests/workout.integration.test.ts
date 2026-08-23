import { randomUUID } from 'node:crypto'
import pg from 'pg'
import type { WASocket } from '@whiskeysockets/baileys'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const databaseUrl = process.env.DATABASE_URL
const integration = databaseUrl ? describe : describe.skip

integration('registro completo pelo WhatsApp', () => {
  const ownerId = randomUUID()
  const programId = randomUUID()
  const templateId = randomUUID()
  const exerciseIds = [randomUUID(), randomUUID(), randomUUID()]
  const itemIds = [randomUUID(), randomUUID(), randomUUID()]
  const sessionId = randomUUID()
  const client = new pg.Client({ connectionString: databaseUrl })

  beforeAll(async () => {
    await client.connect()
    await client.query(`insert into users (id,google_sub,email,name)
      values ($1,$2,$3,'Integração WhatsApp')`, [ownerId, `bot-${ownerId}`, `${ownerId}@test.invalid`])
    await client.query(`insert into programs (id,owner_id,name,sessions_per_cycle,cycles_per_block)
      values ($1,$2,'Integração WhatsApp',1,1)`, [programId, ownerId])
    await client.query(`insert into templates (id,owner_id,program_id,position,name)
      values ($1,$2,$3,0,'Treino WhatsApp')`, [templateId, ownerId, programId])
    for (let index = 0; index < exerciseIds.length; index++) {
      await client.query(`insert into exercises (id,owner_id,name)
        values ($1,$2,$3)`, [exerciseIds[index], ownerId, `Exercício ${index + 1}`])
      await client.query(`insert into template_items
        (id,owner_id,template_id,position,exercise_id,sets,rep_min,rep_max,rir_target)
        values ($1,$2,$3,$4,$5,3,10,12,2)`,
      [itemIds[index], ownerId, templateId, index, exerciseIds[index]])
    }
    await client.query(`insert into workout_sessions
      (id,owner_id,program_id,template_id,status,started_at)
      values ($1,$2,$3,$4,'em_andamento',now() - interval '1 day')`, [sessionId, ownerId, programId, templateId])
  })

  afterAll(async () => {
    await client.query('delete from set_logs where owner_id=$1', [ownerId])
    await client.query('delete from workout_sessions where owner_id=$1', [ownerId])
    await client.query('delete from template_items where owner_id=$1', [ownerId])
    await client.query('delete from exercises where owner_id=$1', [ownerId])
    await client.query('delete from templates where owner_id=$1', [ownerId])
    await client.query('delete from programs where owner_id=$1', [ownerId])
    await client.query('delete from users where id=$1', [ownerId])
    await client.end()
  })

  it('conclui com skip e permite substituí-lo por séries depois', async () => {
    const { previewTodayWorkout, recordExercise, skipExercise } = await import('../src/workout.js')
    const { editableWorkoutReview, editTargetWorkout, endOpenWorkout, lastWorkoutReview, openWorkoutReview } = await import('../src/workout-history.js')
    expect(await previewTodayWorkout(ownerId)).toMatchObject({ templateName: 'Treino WhatsApp', alreadyStarted: true })
    const first = await recordExercise(ownerId, {
      exerciseNumber: 1, weightKg: 100, sets: 3, reps: 12, rir: 2,
    })
    const partial = await client.query('select status, ended_at from workout_sessions where id=$1', [sessionId])

    expect(first).toMatchObject({ status: 'saved', finished: false })
    expect(partial.rows[0]).toEqual({ status: 'em_andamento', ended_at: null })

    const skipped = await skipExercise(ownerId, 2)
    expect(skipped).toMatchObject({ status: 'skipped', finished: false })

    const last = await recordExercise(ownerId, {
      exerciseNumber: 3, weightKg: 80, sets: 3, reps: 10, rir: 1,
    })
    const completed = await client.query('select status, ended_at from workout_sessions where id=$1', [sessionId])

    expect(last).toMatchObject({ status: 'saved', finished: true })
    expect(completed.rows[0].status).toBe('concluida')
    expect(completed.rows[0].ended_at).toBeInstanceOf(Date)

    await client.query(`update set_logs set template_item_id=null
      where session_id=$1 and exercise_id=$2`, [sessionId, exerciseIds[0]])
    expect((await lastWorkoutReview(ownerId))?.items[0]).toMatchObject({
      weightKg: 100, sets: 3, reps: 12, rir: 2,
    })

    const correction = await recordExercise(ownerId, {
      exerciseNumber: 2, weightKg: 60, sets: 3, reps: 12, rir: 2,
    })
    const logs = await client.query(`select skipped,deleted_at,weight_kg from set_logs
      where session_id=$1 and template_item_id=$2 order by created_at`, [sessionId, itemIds[1]])

    expect(correction).toMatchObject({ status: 'saved' })
    expect(logs.rows).toHaveLength(4)
    expect(logs.rows[0]).toMatchObject({ skipped: true })
    expect(logs.rows[0].deleted_at).toBeInstanceOf(Date)
    expect(logs.rows.slice(1).every((row) => !row.skipped && row.weight_kg === '60.00')).toBe(true)

    const edited = await editTargetWorkout(ownerId, {
      exerciseNumber: 1, weightKg: 105, sets: 4, reps: 8, rir: 1,
    })
    const review = await lastWorkoutReview(ownerId)
    expect(edited).toMatchObject({ status: 'saved', item: { name: 'Exercício 1' } })
    expect(review?.items[0]).toMatchObject({ weightKg: 105, sets: 4, reps: 8, rir: 1 })

    const secondSessionId = randomUUID()
    await client.query(`insert into workout_sessions
      (id,owner_id,program_id,template_id,status,started_at)
      values ($1,$2,$3,$4,'em_andamento',now())`, [secondSessionId, ownerId, programId, templateId])
    expect(await editTargetWorkout(ownerId, {
      exerciseNumber: 1, weightKg: 110, sets: 3, reps: 8, rir: 1,
    })).toMatchObject({ status: 'saved' })
    expect((await openWorkoutReview(ownerId))?.items[0]).toMatchObject({ weightKg: 110, sets: 3, reps: 8 })
    expect((await editableWorkoutReview(ownerId))?.sessionId).toBe(secondSessionId)
    expect(await endOpenWorkout(ownerId)).toBe(true)
    expect((await client.query('select status from workout_sessions where id=$1', [secondSessionId])).rows[0].status).toBe('incompleta')

    await client.query(`update workout_sessions set ended_at=now() + interval '1 day' where id=$1`, [sessionId])
    expect((await lastWorkoutReview(ownerId))?.sessionId).toBe(secondSessionId)
    await editTargetWorkout(ownerId, { exerciseNumber: 1, weightKg: 50, sets: 2, reps: 15, rir: 3 })
    const target = await client.query(`select distinct session_id from set_logs
      where owner_id=$1 and weight_kg=50 and deleted_at is null`, [ownerId])
    expect(target.rows).toEqual([{ session_id: secondSessionId }])

    const beforePreview = Number((await client.query(`select count(*) from workout_sessions where owner_id=$1`, [ownerId])).rows[0].count)
    expect(await previewTodayWorkout(ownerId)).toMatchObject({ alreadyStarted: false })
    const afterPreview = Number((await client.query(`select count(*) from workout_sessions where owner_id=$1`, [ownerId])).rows[0].count)
    expect(afterPreview).toBe(beforePreview)

    const { weeklyHistory } = await import('../src/weekly-history.js')
    const week = await weeklyHistory(ownerId)
    expect(week.map((session) => session.id)).toEqual([secondSessionId, sessionId])
    expect(week.find((session) => session.id === sessionId)).toMatchObject({
      status: 'concluida', exercises: 3,
    })
  })

  it('mantém o plano do WhatsApp depois de o template ser editado', async () => {
    const { previewTodayWorkout, startTodayWorkout } = await import('../src/workout.js')
    const { editableWorkoutReview, endOpenWorkout } = await import('../src/workout-history.js')
    const started = await startTodayWorkout(ownerId)
    expect(started?.templateName).toBe('Treino WhatsApp')
    expect(started?.items[0]).toMatchObject({
      name: 'Exercício 1', sets: 3, repMin: 10, repMax: 12, rirTarget: 2,
    })

    const stored = await client.query(`select plan_snapshot from workout_sessions where id=$1`, [started!.sessionId])
    expect(stored.rows[0].plan_snapshot).toMatchObject({ version: 1, templateName: 'Treino WhatsApp' })
    expect(stored.rows[0].plan_snapshot.items[0]).toMatchObject({
      exerciseName: 'Exercício 1', sets: 3, repMin: 10, repMax: 12, rirTarget: 2,
    })

    await client.query(`update templates set name='Treino alterado' where id=$1`, [templateId])
    await client.query(`update template_items set sets=5,rep_min=6,rep_max=8,rir_target=0 where id=$1`, [itemIds[0]])
    await client.query(`update exercises set name='Exercício alterado' where id=$1`, [exerciseIds[0]])

    const preview = await previewTodayWorkout(ownerId)
    expect(preview?.templateName).toBe('Treino WhatsApp')
    expect(preview?.items[0]).toMatchObject({
      name: 'Exercício 1', sets: 3, repMin: 10, repMax: 12, rirTarget: 2,
    })
    expect((await editableWorkoutReview(ownerId))?.templateName).toBe('Treino WhatsApp')
    expect(await endOpenWorkout(ownerId)).toBe(true)
  })

  it('persiste e revoga mensagens conhecidas do grupo', async () => {
    const { clearTrackedMessages, trackGroupMessage } = await import('../src/chat-cleaner.js')
    const jid = 'grupo-teste@g.us'
    await trackGroupMessage(ownerId, { remoteJid: jid, id: 'recebida', fromMe: false, participant: 'usuario@s.whatsapp.net' }, 100)
    await trackGroupMessage(ownerId, { remoteJid: jid, id: 'enviada', fromMe: true }, 200)
    const chatModify = vi.fn().mockResolvedValue(undefined)

    await expect(clearTrackedMessages(ownerId, { chatModify } as unknown as WASocket, jid))
      .resolves.toEqual({ cleared: 2, failed: 0 })
    expect(chatModify).toHaveBeenCalledWith({
      clear: true,
      lastMessages: [{
        key: { remoteJid: jid, id: 'enviada', fromMe: true, participant: undefined },
        messageTimestamp: 200,
      }],
    }, jid)
    expect((await client.query(`select 1 from whatsapp_group_messages where owner_id=$1`, [ownerId])).rowCount).toBe(0)
  })
})
