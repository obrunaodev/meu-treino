import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../lib/http-error.js'
import { logger } from '../lib/logger.js'

/**
 * Limitador de taxa por janela fixa, em memória.
 *
 * Em memória basta porque a API roda num container só; num segundo processo
 * cada um contaria a sua metade. Se um dia houver réplica, isto vira Redis —
 * e é por isso que o estado mora atrás desta função, e não espalhado nas rotas.
 *
 * Não substitui autenticação: serve para que uma rota cara ou adivinhável não
 * possa ser martelada. O alvo principal é `/auth/dev-login`, que é um bypass
 * deliberado onde o token é a única barreira.
 */

interface Bucket {
  count: number
  resetAt: number
}

/**
 * Teto de chaves distintas. Sem ele, um atacante variando o IP de origem
 * transforma o limitador no vazamento de memória que ele deveria prevenir —
 * exatamente o problema que o `sentMessageIds` do bot tinha.
 */
const MAX_KEYS = 10_000

export interface RateLimitOptions {
  /** Tamanho da janela. */
  windowMs: number
  /** Quantas requisições cabem nela. */
  max: number
  /** Código devolvido ao estourar; entra no corpo como `{ code }`. */
  code?: string
  /**
   * O que consome a cota.
   *
   * `falhas` só conta resposta 4xx/5xx, e é o certo em rota de login: quem
   * acerta o token não está atacando, e contar o acerto puniria uso legítimo —
   * a suíte de integração, por exemplo, loga várias vezes de propósito. O que
   * precisa de teto é a tentativa que erra.
   */
  count?: 'todas' | 'falhas'
}

export function rateLimit({
  windowMs, max, code = 'muitas_tentativas', count = 'todas',
}: RateLimitOptions) {
  const buckets = new Map<string, Bucket>()

  const sweep = (now: number) => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now()
    // `trust proxy` já está ligado, então req.ip respeita o X-Forwarded-For
    // do Caddy — sem isso todo mundo cairia no mesmo balde em produção.
    const key = req.ip ?? 'desconhecido'

    if (buckets.size >= MAX_KEYS) sweep(now)

    const bucket = buckets.get(key)
    const janela = bucket && bucket.resetAt > now ? bucket : null
    const usado = janela?.count ?? 0

    // Anuncia o orçamento em toda resposta. Serve ao cliente e, de quebra,
    // torna a fiação verificável sem precisar esgotar a cota num teste —
    // esgotar deixaria o balde cheio para a rodada seguinte.
    res.setHeader('RateLimit-Limit', String(max))
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - usado)))
    res.setHeader('RateLimit-Reset', String(
      janela ? Math.ceil((janela.resetAt - now) / 1000) : Math.ceil(windowMs / 1000),
    ))

    if (usado >= max) {
      const retryAfter = Math.ceil((janela!.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      logger.warn({ ip: key, rota: req.originalUrl }, 'limite de taxa atingido')
      return next(new HttpError(429, code, { retryAfter }))
    }

    // Contabiliza no fim, porque só aí se sabe se a resposta foi falha.
    res.on('finish', () => {
      if (count === 'falhas' && res.statusCode < 400) return
      const atual = buckets.get(key)
      if (atual && atual.resetAt > Date.now()) atual.count += 1
      else buckets.set(key, { count: 1, resetAt: Date.now() + windowMs })
    })

    next()
  }
}
