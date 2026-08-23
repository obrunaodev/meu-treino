/**
 * A API devolve código, nunca frase pronta — a tradução é do cliente, que já
 * carrega pt-BR e en-US.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code)
  }
}

export const badRequest = (code: string, details?: unknown) => new HttpError(400, code, details)
export const unauthorized = (code = 'nao_autenticado') => new HttpError(401, code)
export const forbidden = (code = 'sem_permissao') => new HttpError(403, code)
export const notFound = (code = 'nao_encontrado') => new HttpError(404, code)
