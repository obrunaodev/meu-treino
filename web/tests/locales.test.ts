import { describe, expect, it } from 'vitest'
import enUS from '../src/locales/en-US.json'
import ptBR from '../src/locales/pt-BR.json'

/** Toda cópia existe nos dois idiomas: faltar uma chave mostra o identificador cru na tela. */
describe('paridade de idiomas', () => {
  it('a história do exercício tem as mesmas chaves em pt-BR e en-US', () => {
    expect(Object.keys(enUS.exercise_history).sort()).toEqual(Object.keys(ptBR.exercise_history).sort())
  })
})
