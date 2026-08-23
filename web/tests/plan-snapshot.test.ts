import { beforeEach, describe, expect, it } from 'vitest'
import { localDb } from '../src/lib/db'
import { makeActions } from '../src/lib/actions'

const OWNER = '00000000-0000-7000-8000-000000000010'
const actions = makeActions(OWNER)

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
})

describe('snapshot do plano', () => {
  it('preserva a prescrição e o equipamento depois de editar o treino', async () => {
    const gear = await actions.saveEquipment({
      name: 'Leg press 45', loadType: 'anilha', incrementKg: 5, plateTable: [], gymId: null,
    })
    const exercise = await actions.saveExercise({
      name: 'Leg press', equipmentId: gear.id, laterality: 'bilateral',
      unilateralAsymmetric: false, loadPerSide: true,
    })
    const template = await actions.saveTemplate({ programId: 'program', position: 0, name: 'Treino A' })
    const item = await actions.saveTemplateItem({
      templateId: template.id, position: 0, exerciseId: exercise.id,
      sets: 3, repMin: 10, repMax: 15, rirTarget: 2, restSeconds: 90, isTimeBased: false,
    })

    const session = await actions.startSession('program', template.id, 1, 1)
    await actions.saveTemplate({ id: template.id, name: 'Treino renomeado' })
    await actions.saveTemplateItem({ id: item.id, sets: 5, repMin: 6, repMax: 8, rirTarget: 0, restSeconds: 180 })
    await actions.saveExercise({ id: exercise.id, name: 'Leg press novo', loadPerSide: false })
    await actions.saveEquipment({ id: gear.id, name: 'Outra máquina', loadType: 'pino', plateTable: [10, 20] })

    expect(session.planSnapshot).toMatchObject({
      version: 1,
      templateName: 'Treino A',
      items: [{
        id: item.id, position: 0, exerciseName: 'Leg press',
        sets: 3, repMin: 10, repMax: 15, rirTarget: 2, restSeconds: 90,
        laterality: 'bilateral', unilateralAsymmetric: false, loadPerSide: true,
        equipment: { id: gear.id, name: 'Leg press 45', loadType: 'anilha', incrementKg: 5, plateTable: [] },
      }],
    })
  })
})
