import type { NextFunction, Request, Response } from 'express'
import { isProd } from '../lib/env.js'

/**
 * Cabeçalhos defensivos.
 *
 * A API só devolve JSON e stream de imagem — nunca HTML —, então o conjunto
 * relevante é curto e escrito à mão. `helmet` traria uma dúzia de cabeçalhos
 * pensados para páginas renderizadas, e a maior parte não se aplica aqui.
 *
 * O SPA é servido pelo nginx/Caddy, não por este processo: a política de
 * conteúdo da página é de lá. Aqui a CSP serve só para que uma resposta desta
 * origem não consiga executar nada se alguém a abrir direto no navegador.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  // Impede o navegador de adivinhar o tipo: um upload que passe pelos magic
  // bytes mas seja servido errado não vira script por sniffing.
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")

  // Só sob TLS: em dev o navegador travaria localhost em https para sempre.
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  next()
}
