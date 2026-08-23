import { beforeEach, describe, expect, it } from 'vitest'
import { localDb } from '../src/lib/db'
import { mutate } from '../src/lib/outbox'
import { makeActions } from '../src/lib/actions'
import type { Exercise, SetLog, TemplateItem } from '../src/lib/types'

/**
 * Apagar um exercício da biblioteca tem duas metades opostas: o que só existe
 * por causa dele some, e o que aconteceu de verdade fica. Confundir as duas
 * apaga histórico ou deixa treino apontando para o vazio.
 */

const OWNER = '00000000-0000-7000-8000-000000000003'
const actions = makeActions(OWNER)

async function seedExercise(name: string) {
  return await mutate('exercises', {
    ownerId: OWNER, name, laterality: 'bilateral', unilateralAsymmetric: false,
    loadPerSide: false, cues: [],
  }) as unknown as Exercise
}

async function seedUsage(exercise: Exercise, other: Exercise) {
  await mutate('template_items', {
    ownerId: OWNER, templateId: 't1', position: 0, exerciseId: exercise.id, sets: 3,
  })
  await mutate('exercise_media', {
    ownerId: OWNER, exerciseId: exercise.id, s3Key: 'k', thumbKey: 'tk', mime: 'image/webp', bytes: 10,
  })
  await mutate('exercise_substitutions', {
    ownerId: OWNER, exerciseId: exercise.id, substituteExerciseId: other.id, reason: 'dor',
  })
  await mutate('exercise_substitutions', {
    ownerId: OWNER, exerciseId: other.id, substituteExerciseId: exercise.id, reason: 'equipamento',
  })
  await actions.logSet({ sessionId: 's1', exerciseId: exercise.id, setIndex: 0, reps: 10, weightKg: 60 })
}

const alive = async (entity: Parameters<typeof localDb.table_>[0]) =>
  (await localDb.table_(entity).toArray()).filter((row) => !row.deletedAt)

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
})

describe('deleteExercise', () => {
  it('tira o exercício do treino, junto com mídia e substituições', async () => {
    const exercise = await seedExercise('Banco adutor')
    const other = await seedExercise('Cadeira abdutora')
    await seedUsage(exercise, other)

    await actions.deleteExercise(exercise.id)

    expect((await alive('exercises')).map((e) => e.id)).toEqual([other.id])
    expect(await alive('template_items')).toHaveLength(0)
    expect(await alive('exercise_media')).toHaveLength(0)
    expect(await alive('exercise_substitutions')).toHaveLength(0)
  })

  it('preserva a série já registrada — o treino foi feito', async () => {
    const exercise = await seedExercise('Banco adutor')
    const other = await seedExercise('Cadeira abdutora')
    await seedUsage(exercise, other)

    await actions.deleteExercise(exercise.id)

    const sets = (await alive('set_logs')) as unknown as SetLog[]
    expect(sets).toHaveLength(1)
    expect(sets[0].exerciseId).toBe(exercise.id)
  })

  it('não encosta no item de treino de outro exercício', async () => {
    const exercise = await seedExercise('Banco adutor')
    const other = await seedExercise('Cadeira abdutora')
    await seedUsage(exercise, other)
    await mutate('template_items', {
      ownerId: OWNER, templateId: 't1', position: 1, exerciseId: other.id, sets: 3,
    })

    await actions.deleteExercise(exercise.id)

    const items = (await alive('template_items')) as unknown as TemplateItem[]
    expect(items).toHaveLength(1)
    expect(items[0].exerciseId).toBe(other.id)
  })

  it('enfileira cada remoção, para o servidor receber a cascata', async () => {
    const exercise = await seedExercise('Banco adutor')
    const other = await seedExercise('Cadeira abdutora')
    await seedUsage(exercise, other)

    await actions.deleteExercise(exercise.id)

    const deletes = (await localDb.outbox.toArray()).filter((o) => o.op === 'delete')
    expect(new Set(deletes.map((o) => o.entity))).toEqual(
      new Set(['template_items', 'exercise_media', 'exercise_substitutions', 'exercises']),
    )
  })
})
