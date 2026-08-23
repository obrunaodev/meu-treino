import { describe, expect, it } from 'vitest'
import {
  RECONNECT_BASE_MS, RECONNECT_MAX_MS, SentMessages, reconnectDelay,
} from '../src/reconnect.js'

/**
 * A retentativa era fixa em 1,5 s. Numa recusa persistente do WhatsApp isso
 * vira laço quente: handshake, socket e query ao Postgres a cada 1,5 s, para
 * sempre, numa VPS de 1 GB.
 */
describe('reconnectDelay', () => {
  // random() fixo em 1 tira o jitter e deixa a escalada visível.
  const semJitter = (n: number) => reconnectDelay(n, () => 1)

  it('dobra a cada tentativa', () => {
    expect(semJitter(1)).toBe(RECONNECT_BASE_MS)
    expect(semJitter(2)).toBe(RECONNECT_BASE_MS * 2)
    expect(semJitter(3)).toBe(RECONNECT_BASE_MS * 4)
    expect(semJitter(4)).toBe(RECONNECT_BASE_MS * 8)
  })

  it('para de crescer no teto', () => {
    expect(semJitter(20)).toBe(RECONNECT_MAX_MS)
    expect(semJitter(200)).toBe(RECONNECT_MAX_MS)
  })

  it('nunca devolve espera absurda, mesmo com tentativa gigante', () => {
    // Sem o clamp do expoente, 2 ** 1000 vira Infinity e o setTimeout dispara
    // na hora — o laço quente voltaria justo no caso mais grave.
    expect(Number.isFinite(semJitter(1000))).toBe(true)
    expect(semJitter(1000)).toBeLessThanOrEqual(RECONNECT_MAX_MS)
  })

  it('o jitter mantém a espera entre 50% e 100% da base', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const espera = reconnectDelay(3, () => r)
      const base = RECONNECT_BASE_MS * 4
      expect(espera).toBeGreaterThanOrEqual(base * 0.5)
      expect(espera).toBeLessThanOrEqual(base)
    }
  })

  it('donos que caem juntos não voltam no mesmo instante', () => {
    const esperas = new Set(Array.from({ length: 50 }, () => reconnectDelay(5)))
    expect(esperas.size).toBeGreaterThan(1)
  })
})

/**
 * O `Set` antigo só perdia um id quando o eco correspondente chegava. Quando o
 * socket caía entre o envio e o retorno, o id ficava para sempre.
 */
describe('SentMessages', () => {
  it('reconhece o eco da própria mensagem e o consome', () => {
    const enviadas = new SentMessages()
    enviadas.remember('abc')

    expect(enviadas.consume('abc')).toBe(true)
    // Consumido: o mesmo id não se repete.
    expect(enviadas.consume('abc')).toBe(false)
  })

  it('não confunde mensagem de terceiro com eco', () => {
    const enviadas = new SentMessages()
    enviadas.remember('minha')
    expect(enviadas.consume('de-outro')).toBe(false)
  })

  it('esquece id cujo eco nunca chegou', () => {
    const enviadas = new SentMessages(60_000, 500)
    const t0 = 1_000_000

    enviadas.remember('perdida', t0)
    expect(enviadas.size).toBe(1)

    // Uma mensagem nova, muito depois: a varredura leva a antiga junto.
    enviadas.remember('nova', t0 + 60_001)
    expect(enviadas.size).toBe(1)
    expect(enviadas.consume('perdida')).toBe(false)
    expect(enviadas.consume('nova')).toBe(true)
  })

  it('respeita o teto absoluto mesmo sem tempo passar', () => {
    const enviadas = new SentMessages(60_000, 10)
    for (let i = 0; i < 100; i++) enviadas.remember(`id-${i}`, 1_000)

    expect(enviadas.size).toBeLessThanOrEqual(10)
    // Descarta o mais antigo, mantém o mais recente.
    expect(enviadas.consume('id-0')).toBe(false)
    expect(enviadas.consume('id-99')).toBe(true)
  })
})
