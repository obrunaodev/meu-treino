import { describe, expect, it } from 'vitest'
import { hasLinkOption, parseBotCommand, parseEditEntry, parseExerciseEntry, parseSkipEntry } from '../src/parser.js'

describe('parseExerciseEntry', () => {
  it('interpreta o formato documentado', () => {
    expect(parseExerciseEntry('1 100kg 3x15 1rir')).toEqual({
      ok: true,
      value: { exerciseNumber: 1, weightKg: 100, sets: 3, reps: 15, rir: 1 },
    })
  })

  it('tolera campos fora de ordem, abreviações e separadores', () => {
    expect(parseExerciseEntry('3/12 RIR2 80k exercício 4')).toEqual({
      ok: true,
      value: { exerciseNumber: 4, weightKg: 80, sets: 3, reps: 12, rir: 2 },
    })
  })

  it('corrige erro de digitação curto na unidade', () => {
    expect(parseExerciseEntry('1 100kgg 3x15 1rir')).toMatchObject({
      ok: true,
      value: { exerciseNumber: 1, weightKg: 100 },
    })
  })

  it('tolera unidade antes da carga e vírgula decimal', () => {
    expect(parseExerciseEntry('2 kg 22,5 4-10 ri 3')).toEqual({
      ok: true,
      value: { exerciseNumber: 2, weightKg: 22.5, sets: 4, reps: 10, rir: 3 },
    })
  })

  it('converte libras para o valor canônico em kg', () => {
    const result = parseExerciseEntry('1 220lb 3x8 2r')
    expect(result.ok && result.value.weightKg).toBeCloseTo(99.79, 1)
  })

  it('explica o campo ausente sem inventar um valor', () => {
    expect(parseExerciseEntry('1 100kg 3x15')).toEqual({ ok: false, reason: 'rir' })
  })
})

describe('parseSkipEntry', () => {
  it('interpreta /skip seguido do número', () => {
    expect(parseSkipEntry('/skip 3')).toBe(3)
    expect(parseSkipEntry('  /SKIP   12 ')).toBe(12)
  })

  it('não confunde texto parcial com o comando', () => {
    expect(parseSkipEntry('/skip')).toBeNull()
    expect(parseSkipEntry('3 skip')).toBeNull()
    expect(parseSkipEntry('3 /skip')).toBeNull()
  })

  it('aceita aliases em português e erros curtos', () => {
    expect(parseSkipEntry('/pular 3')).toBe(3)
    expect(parseSkipEntry('/pula 4')).toBe(4)
    expect(parseSkipEntry('/skp 5')).toBe(5)
  })
})

describe('comandos', () => {
  it('normaliza aliases e pequenos erros de digitação', () => {
    expect(parseBotCommand('/início')).toEqual({ command: 'start', args: '' })
    expect(parseBotCommand('/inicar')).toEqual({ command: 'start', args: '' })
    expect(parseBotCommand('/strat')).toEqual({ command: 'start', args: '' })
    expect(parseBotCommand('/edti')).toEqual({ command: 'edit', args: '' })
    expect(parseBotCommand('/editar 1 25kg 15x3 4rir')).toEqual({
      command: 'edit', args: '1 25kg 15x3 4rir',
    })
    expect(parseBotCommand('/finalizar')).toEqual({ command: 'end', args: '' })
    expect(parseBotCommand('/ajuda')).toEqual({ command: 'help', args: '' })
    expect(parseBotCommand('/hlep')).toEqual({ command: 'help', args: '' })
    expect(parseBotCommand('/limpar')).toEqual({ command: 'clear', args: '' })
    expect(parseBotCommand('/clean')).toEqual({ command: 'clear', args: '' })
    expect(parseBotCommand('/claer')).toEqual({ command: 'clear', args: '' })
    expect(parseBotCommand('/histórico')).toEqual({ command: 'history', args: '' })
    expect(parseBotCommand('/histroy')).toEqual({ command: 'history', args: '' })
    expect(parseBotCommand('/hoje')).toEqual({ command: 'today', args: '' })
    expect(parseBotCommand('/toady')).toEqual({ command: 'today', args: '' })
    expect(parseBotCommand('/skip 3')).toEqual({ command: 'skip', args: '3' })
    expect(parseBotCommand('/pular 4')).toEqual({ command: 'skip', args: '4' })
    expect(parseBotCommand('/last')).toEqual({ command: 'last', args: '' })
    expect(parseBotCommand('/último')).toEqual({ command: 'last', args: '' })
    expect(parseBotCommand('/ultmo')).toEqual({ command: 'last', args: '' })
  })

  it('interpreta edição como repetições por séries', () => {
    expect(parseEditEntry('1 25kg 3x15 4rir')).toEqual({
      ok: true,
      value: { exerciseNumber: 1, weightKg: 25, reps: 15, sets: 3, rir: 4 },
    })
  })

  it('reconhece o modificador de links e erros curtos', () => {
    expect(hasLinkOption('--link')).toBe(true)
    expect(hasLinkOption('--links')).toBe(true)
    expect(hasLinkOption('-l')).toBe(true)
    expect(hasLinkOption('--lnik')).toBe(true)
    expect(hasLinkOption('')).toBe(false)
  })
})
