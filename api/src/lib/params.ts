import type { Request } from 'express'
import { badRequest } from './http-error.js'

/**
 * Express 5 tipa `req.params` como `string | string[]`, porque uma rota com
 * wildcard pode repetir o mesmo nome. Nenhuma rota nossa faz isso, mas o
 * estreitamento precisa ser explícito — e de quebra valida o parâmetro vazio.
 */
export function param(req: Request, name: string): string {
  const value = req.params[name]
  if (typeof value !== 'string' || value.length === 0) {
    throw badRequest('parametro_ausente', { name })
  }
  return value
}
