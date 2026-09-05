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

  it('aceita os quatro níveis de esforço e pequenos erros', () => {
    expect(parseExerciseEntry('1 100kg 3x15 leve')).toMatchObject({ ok: true, value: { rir: 4 } })
    expect(parseExerciseEntry('1 100kg 3x15 moderdo')).toMatchObject({ ok: true, value: { rir: 2 } })
    expect(parseExerciseEntry('1 100kg 3x15 pesado')).toMatchObject({ ok: true, value: { rir: 1 } })
    expect(parseExerciseEntry('1 100kg 3x15 muito pesado')).toMatchObject({ ok: true, value: { rir: 0 } })
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

/**
 * `weight_kg` é numeric(7,2). Sem faixa no parser, um zero a mais estourava o
 * INSERT, a exceção subia até o handler de mensagens — que só loga — e o
 * usuário ficava sem resposta nenhuma no grupo.
 */
describe('faixas de sanidade', () => {
  it('recusa carga absurda em vez de deixar o banco estourar', () => {
    const result = parseExerciseEntry('1 999999999kg 3x15 2rir')
    expect(result).toEqual({ ok: false, reason: 'weight_range' })
  })

  it('recusa carga logo acima do teto', () => {
    expect(parseExerciseEntry('1 1000kg 3x15 2rir')).toEqual({ ok: false, reason: 'weight_range' })
  })

  it('aceita a carga mais pesada plausível', () => {
    const result = parseExerciseEntry('1 999kg 3x15 2rir')
    expect(result.ok).toBe(true)
  })

  it('recusa contagem de séries que viraria dezenas de INSERTs', () => {
    expect(parseExerciseEntry('1 100kg 99x15 2rir')).toEqual({ ok: false, reason: 'sets_range' })
  })

  it('converte libras antes de aplicar o teto', () => {
    // 2000 lb = 907 kg, abaixo do teto: a faixa é sobre o valor gravado.
    const result = parseExerciseEntry('1 2000lb 3x15 2rir')
    expect(result.ok).toBe(true)
    if (result.ok) expect(Math.round(result.value.weightKg)).toBe(907)
  })

  it('carga de peso corporal continua válida', () => {
    expect(parseExerciseEntry('1 0kg 3x15 2rir').ok).toBe(true)
  })
})
