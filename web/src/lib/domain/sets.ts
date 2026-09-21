/**
 * Séries, não linhas.
 *
 * Um exercício que registra lados separados grava uma linha por lado, e as
 * duas são a mesma série: contar linhas diria "6 de 3 séries" num 3×12
 * unilateral, e a aderência passaria com metade do treino feito. O índice da
 * série é o que as une — é igual nos dois lados por construção —, e o item do
 * plano separa o mesmo exercício prescrito duas vezes no mesmo treino.
 */

export interface SetRow {
  sessionId: string
  templateItemId: string | null
  exerciseId: string
  setIndex: number
}

/** Duas linhas da mesma série compartilham esta chave; séries diferentes nunca. */
export function setKey(row: SetRow): string {
  return `${row.sessionId}|${row.templateItemId ?? row.exerciseId}|${row.setIndex}`
}

export function countSets(rows: SetRow[]): number {
  return new Set(rows.map(setKey)).size
}
