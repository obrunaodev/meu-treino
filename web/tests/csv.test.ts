import { describe, expect, it } from 'vitest'
import { toCsv } from '../src/lib/domain/csv'

describe('toCsv', () => {
  it('usa CRLF, como o RFC 4180 pede', () => {
    expect(toCsv(['a', 'b'], [[1, 2]])).toBe('a,b\r\n1,2')
  })

  it('protege campo com vírgula', () => {
    expect(toCsv(['nome'], [['Leg press, horizontal']])).toContain('"Leg press, horizontal"')
  })

  it('dobra aspas internas', () => {
    expect(toCsv(['nota'], [['pegada "neutra"']])).toContain('"pegada ""neutra"""')
  })

  it('protege campo com quebra de linha', () => {
    expect(toCsv(['nota'], [['linha1\nlinha2']])).toContain('"linha1\nlinha2"')
  })

  it('nulo e indefinido viram campo vazio, não a string "null"', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('a,b\r\n,')
  })

  it('preserva acento sem escapar à toa', () => {
    expect(toCsv(['exercicio'], [['Extensão de joelhos']])).toBe('exercicio\r\nExtensão de joelhos')
  })
})
