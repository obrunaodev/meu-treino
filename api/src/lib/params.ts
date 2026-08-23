import type { Request } from 'express'
import { badRequest, notFound } from './http-error.js'

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Parâmetro que vai virar `uuid` numa query.
 *
 * Sem esta checagem o texto chega cru ao Postgres, que recusa com
 * `invalid input syntax for type uuid` — uma exceção do driver, que o
 * errorHandler traduz para 500. O recurso não existe: isso é 404, e um id
 * malformado não é falha do servidor.
 */
export function uuidParam(req: Request, name: string): string {
  const value = param(req, name)
  if (!UUID.test(value)) throw notFound('nao_encontrado')
  return value
}

/**
 * Parâmetro numérico de rota. `Number('abc')` é `NaN`, e um `NaN` numa query
 * de inteiro estoura no driver do mesmo jeito.
 */
export function intParam(req: Request, name: string): number {
  const value = Number(param(req, name))
  if (!Number.isInteger(value)) throw badRequest('parametro_invalido', { name })
  return value
}
