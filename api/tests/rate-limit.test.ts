import { describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { rateLimit } from '../src/middleware/rate-limit.js'
import { HttpError } from '../src/lib/http-error.js'

/**
 * Testado direto no middleware, não pela HTTP: o balde é por IP e vive no
 * processo, então uma suíte que bate na rota real deixa resíduo para a
 * seguinte e vira teste instável entre rodadas.
 */

/** `res` mínimo: só o que o middleware toca, mais o gatilho de `finish`. */
function fakeRes(statusCode = 200) {
  const listeners: Array<() => void> = []
  const res = {
    statusCode,
    setHeader: vi.fn(),
    on: (event: string, fn: () => void) => { if (event === 'finish') listeners.push(fn) },
  } as unknown as Response & { finish: () => void }
  ;(res as unknown as { finish: () => void }).finish = () => listeners.forEach((fn) => fn())
  return res as Response & { finish: () => void; setHeader: ReturnType<typeof vi.fn> }
}

const req = (ip = '10.0.0.1') => ({ ip, originalUrl: '/auth/dev-login' }) as Request

/** Uma passagem completa: middleware + resposta concluída com aquele status. */
function passa(limiter: ReturnType<typeof rateLimit>, status: number, ip?: string) {
  const res = fakeRes(status)
  const next = vi.fn() as unknown as NextFunction
  limiter(req(ip), res, next)
  const erro = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
  if (!erro) res.finish()
  return { bloqueado: erro instanceof HttpError ? erro : null, res }
}

describe('rateLimit', () => {
  it('deixa passar dentro do teto e barra depois', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 3 })

    expect(passa(limiter, 200).bloqueado).toBeNull()
    expect(passa(limiter, 200).bloqueado).toBeNull()
    expect(passa(limiter, 200).bloqueado).toBeNull()

    const quarto = passa(limiter, 200)
    expect(quarto.bloqueado?.status).toBe(429)
  })

  it('conta cada IP no seu próprio balde', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 })

    expect(passa(limiter, 200, '10.0.0.1').bloqueado).toBeNull()
    expect(passa(limiter, 200, '10.0.0.1').bloqueado?.status).toBe(429)
    // Outro IP não herda o bloqueio do primeiro.
    expect(passa(limiter, 200, '10.0.0.2').bloqueado).toBeNull()
  })

  it('a janela expira e libera de novo', () => {
    vi.useFakeTimers()
    try {
      const limiter = rateLimit({ windowMs: 60_000, max: 1 })
      expect(passa(limiter, 200).bloqueado).toBeNull()
      expect(passa(limiter, 200).bloqueado?.status).toBe(429)

      vi.advanceTimersByTime(60_001)
      expect(passa(limiter, 200).bloqueado).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('diz quantos segundos faltam para tentar de novo', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 })
    passa(limiter, 200)
    const { bloqueado, res } = passa(limiter, 200)

    expect(bloqueado?.status).toBe(429)
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String))
    expect((bloqueado?.details as { retryAfter: number }).retryAfter).toBeGreaterThan(0)
  })

  it('devolve o código configurado', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1, code: 'muitos_uploads' })
    passa(limiter, 200)
    expect(passa(limiter, 200).bloqueado?.code).toBe('muitos_uploads')
  })

  /**
   * A propriedade que protege a suíte: quem acerta o token não está atacando.
   * Contar acerto faria a própria suíte de integração se auto-bloquear.
   */
  describe("count: 'falhas'", () => {
    it('sucesso não consome cota, por mais que se repita', () => {
      const limiter = rateLimit({ windowMs: 60_000, max: 2, count: 'falhas' })
      for (let i = 0; i < 50; i++) {
        expect(passa(limiter, 200).bloqueado).toBeNull()
      }
    })

    it('falha consome, e o bloqueio vale para todo mundo depois', () => {
      const limiter = rateLimit({ windowMs: 60_000, max: 2, count: 'falhas' })
      expect(passa(limiter, 401).bloqueado).toBeNull()
      expect(passa(limiter, 401).bloqueado).toBeNull()
      // Terceira tentativa: o balde já tem 2, que é o teto.
      expect(passa(limiter, 401).bloqueado?.status).toBe(429)
      // E nem acertando o token se escapa enquanto a janela não vira.
      expect(passa(limiter, 200).bloqueado?.status).toBe(429)
    })

    it('erro 5xx também conta, não só o 4xx', () => {
      const limiter = rateLimit({ windowMs: 60_000, max: 1, count: 'falhas' })
      expect(passa(limiter, 500).bloqueado).toBeNull()
      expect(passa(limiter, 500).bloqueado?.status).toBe(429)
    })
  })
})

describe('cabeçalhos de orçamento', () => {
  it('anuncia teto, restante e quando reseta', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 5, count: 'falhas' })
    const { res } = passa(limiter, 401)

    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Limit', '5')
    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '5')
    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Reset', '60')
  })

  it('o restante cai conforme a cota é consumida', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 3 })
    passa(limiter, 200)
    const { res } = passa(limiter, 200)

    expect(res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '2')
  })
})
