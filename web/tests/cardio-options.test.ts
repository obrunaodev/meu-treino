import { beforeEach, describe, expect, it } from 'vitest'
import { localDb } from '../src/lib/db'
import { makeActions } from '../src/lib/actions'

const OWNER = '00000000-0000-7000-8000-000000000009'
const actions = makeActions(OWNER)

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
})

describe('opções de cardio da academia', () => {
  it('cria as opções marcadas durante o onboarding', async () => {
    await actions.createProgram({
      name: 'Programa', scheduleMode: 'continuous', weekdays: [],
      templateNames: ['Treino A'], cyclesPerBlock: 4, rirDeltaPerBlock: -1,
      defaultRestSeconds: 90, reminderLeadMinutes: 60, remindersEnabled: false,
      gymName: 'Academia', stations: [], cardioNames: ['Esteira', 'Elíptico'],
    })

    const options = await localDb.table_('cardio_options').toArray()
    expect(options.map((option) => option.name).sort()).toEqual(['Elíptico', 'Esteira'])
    expect(new Set(options.map((option) => option.gymId)).size).toBe(1)
  })

  it('limpa o cardio planejado ao apagar a opção', async () => {
    const option = await actions.saveCardioOption({ name: 'Esteira', gymId: null, notes: null })
    const template = await actions.saveTemplate({
      programId: 'program', position: 0, name: 'Treino A',
      cardioOptionId: option.id, cardioDurationSeconds: 1200, cardioIntensity: 'moderado',
    })

    await actions.removeCardioOption(option.id)

    expect((await localDb.table_('cardio_options').get(option.id))?.deletedAt).toBeTruthy()
    expect(await localDb.table_('templates').get(template.id)).toMatchObject({ cardioOptionId: null })
  })
})
