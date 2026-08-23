import { beforeEach, describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { localDb } from '../src/lib/db'
import { mutate } from '../src/lib/outbox'
import { makeActions } from '../src/lib/actions'
import type { Program, Template } from '../src/lib/types'

/**
 * `sessionsPerCycle` é o tamanho do ciclo, e ele tem que continuar igual à
 * quantidade de treinos. Se derivar, a numeração de ciclo e a fronteira de
 * bloco passam a contar errado — sem erro nenhum na tela.
 */

const OWNER = '00000000-0000-7000-8000-000000000001'
const actions = makeActions(OWNER)

async function seedProgram(templateNames: string[]): Promise<Program> {
  const program = await mutate('programs', {
    ownerId: OWNER,
    name: 'Programa',
    scheduleMode: 'continuous',
    sessionsPerCycle: templateNames.length,
    cyclesPerBlock: 4,
    isActive: true,
  }) as unknown as Program

  for (const [position, name] of templateNames.entries()) {
    await mutate('templates', { ownerId: OWNER, programId: program.id, position, name })
  }
  return program
}

const liveTemplates = async (programId: string) =>
  ((await localDb.table_('templates').toArray()) as unknown as Template[])
    .filter((t) => t.programId === programId && !t.deletedAt)
    .sort((a, b) => a.position - b.position)

const programNow = async (id: string) =>
  ((await localDb.table_('programs').toArray()) as unknown as Program[]).find((p) => p.id === id)!

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
})

describe('addTemplate', () => {
  it('entra no fim do ciclo e aumenta o tamanho do ciclo junto', async () => {
    const program = await seedProgram(['A', 'B'])
    await actions.addTemplate(program, 'C')

    const templates = await liveTemplates(program.id)
    expect(templates.map((t) => t.name)).toEqual(['A', 'B', 'C'])
    expect(templates.map((t) => t.position)).toEqual([0, 1, 2])
    expect((await programNow(program.id)).sessionsPerCycle).toBe(3)
  })
})

describe('deleteTemplate', () => {
  it('remove do ciclo e reduz o tamanho do ciclo', async () => {
    const program = await seedProgram(['A', 'B', 'C'])
    const templates = await liveTemplates(program.id)

    expect(await actions.deleteTemplate(program, templates[1]!.id)).toBe(true)

    const remaining = await liveTemplates(program.id)
    expect(remaining.map((t) => t.name)).toEqual(['A', 'C'])
    expect((await programNow(program.id)).sessionsPerCycle).toBe(2)
  })

  it('reescreve as posições para não deixar buraco no rodízio', async () => {
    const program = await seedProgram(['A', 'B', 'C'])
    const templates = await liveTemplates(program.id)

    await actions.deleteTemplate(program, templates[0]!.id)

    expect((await liveTemplates(program.id)).map((t) => t.position)).toEqual([0, 1])
  })

  it('recusa apagar o último — ciclo sem treino não tem o que rodar', async () => {
    const program = await seedProgram(['A'])
    const templates = await liveTemplates(program.id)

    expect(await actions.deleteTemplate(program, templates[0]!.id)).toBe(false)
    expect(await liveTemplates(program.id)).toHaveLength(1)
    expect((await programNow(program.id)).sessionsPerCycle).toBe(1)
  })

  it('é soft delete: a linha fica para o histórico resolver o nome', async () => {
    const program = await seedProgram(['A', 'B'])
    const templates = await liveTemplates(program.id)
    const victim = templates[1]!

    await actions.deleteTemplate(program, victim.id)

    const stored = await localDb.table_('templates').get(victim.id)
    expect(stored).toBeDefined()
    expect(stored?.deletedAt).toBeTruthy()
    expect(stored?.name).toBe('B')
  })

  it('enfileira a remoção para o servidor, não apaga só local', async () => {
    const program = await seedProgram(['A', 'B'])
    const templates = await liveTemplates(program.id)

    await actions.deleteTemplate(program, templates[1]!.id)

    const ops = await localDb.outbox.toArray()
    expect(ops.some((o) => o.entity === 'templates' && o.op === 'delete')).toBe(true)
  })
})

describe('reorderTemplates', () => {
  it('a ordem dos treinos é a ordem do rodízio', async () => {
    const program = await seedProgram(['A', 'B', 'C'])
    const templates = await liveTemplates(program.id)

    await actions.reorderTemplates([templates[2]!.id, templates[0]!.id, templates[1]!.id])

    expect((await liveTemplates(program.id)).map((t) => t.name)).toEqual(['C', 'A', 'B'])
  })

  it('não mexe no tamanho do ciclo', async () => {
    const program = await seedProgram(['A', 'B'])
    const templates = await liveTemplates(program.id)

    await actions.reorderTemplates([templates[1]!.id, templates[0]!.id])

    expect((await programNow(program.id)).sessionsPerCycle).toBe(2)
  })
})

describe('ciclo e treinos permanecem coerentes', () => {
  it('depois de adicionar e apagar, o tamanho bate com a contagem', async () => {
    const program = await seedProgram(['A', 'B'])
    await actions.addTemplate(program, 'C')
    await actions.addTemplate(await programNow(program.id), 'D')

    const templates = await liveTemplates(program.id)
    await actions.deleteTemplate(await programNow(program.id), templates[0]!.id)

    const final = await liveTemplates(program.id)
    expect((await programNow(program.id)).sessionsPerCycle).toBe(final.length)
    expect(final.map((t) => t.name)).toEqual(['B', 'C', 'D'])
  })
})
