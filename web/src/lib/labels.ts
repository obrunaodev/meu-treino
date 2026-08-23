import type { Exercise } from './types.js'

/**
 * A palavra que marca carga por lado — "40 kg/lado" — ou `null` quando o
 * exercício não é de máquina articulada.
 *
 * Vive fora das telas porque as duas que mostram carga (sessão ao vivo e
 * detalhe do histórico) precisam marcar do mesmo jeito: se divergirem, a mesma
 * série aparece como 40 numa e 40/lado na outra.
 */
export function sideLabel(
  exercise: Pick<Exercise, 'loadPerSide'> | undefined | null,
  t: (key: string) => string,
): string | null {
  return exercise?.loadPerSide ? t('session.per_side_short') : null
}
