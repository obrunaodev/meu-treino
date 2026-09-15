/**
 * Bi-set e tri-set derivados da ordem do treino.
 *
 * Um grupo é uma corrida de itens VIZINHOS que dividem a mesma chave. Nada
 * aqui valida ou conserta o que está gravado: se um cliente antigo reordenar e
 * separar os itens, viram grupos menores ou itens soltos, e voltar a ordem
 * reconstitui o grupo. Assim não existe estado inválido para tratar.
 */

export interface GroupedItem {
  id: string
  sets: number
  restSeconds: number | null
  supersetGroup?: string | null
}

export interface PlanBlock<T> {
  /** Chave do grupo, ou null para item solto. */
  key: string | null
  items: T[]
}

export type SupersetKind = 'biset' | 'triset' | 'giant'

export const MAX_SUPERSET_SIZE = 3

/** Os blocos na ordem do treino. Item sem grupo, ou sozinho com a chave, é bloco de um. */
export function planBlocks<T extends GroupedItem>(items: T[]): Array<PlanBlock<T>> {
  const blocks: Array<PlanBlock<T>> = []
  for (const item of items) {
    const key = item.supersetGroup ?? null
    const last = blocks.at(-1)
    if (key !== null && last?.key === key) last.items.push(item)
    else blocks.push({ key, items: [item] })
  }
  return blocks
}

export function supersetKind(size: number): SupersetKind | null {
  if (size < 2) return null
  if (size === 2) return 'biset'
  return size === 3 ? 'triset' : 'giant'
}

/** O descanso do grupo é o do último membro: é depois dele que a rodada termina. */
export function blockRestSeconds<T extends GroupedItem>(block: PlanBlock<T>, fallback: number): number {
  return block.items.at(-1)?.restSeconds ?? fallback
}

/**
 * Rodadas alternadas: A1, B1, A2, B2… Membro pulado sai das rodadas, e membro
 * com menos séries simplesmente não aparece nas últimas.
 */
export function supersetRounds<T extends GroupedItem>(
  members: T[],
  excluded: ReadonlySet<string> = new Set(),
): Array<Array<{ itemId: string; setIndex: number }>> {
  const active = members.filter((item) => !excluded.has(item.id))
  const rounds = Math.max(0, ...active.map((item) => item.sets))
  return Array.from({ length: rounds }, (_, round) => active
    .filter((item) => item.sets > round)
    .map((item) => ({ itemId: item.id, setIndex: round })))
}

const orderOf = <T extends GroupedItem>(blocks: Array<PlanBlock<T>>) => blocks.flatMap((block) => block.items.map((item) => item.id))

/** Nova ordem ao mover um bloco inteiro; null quando já está na ponta. */
export function moveBlock<T extends GroupedItem>(items: T[], blockIndex: number, direction: -1 | 1): string[] | null {
  const blocks = planBlocks(items)
  const target = blockIndex + direction
  if (blockIndex < 0 || target < 0 || target >= blocks.length) return null
  const reordered = [...blocks]
  const [moved] = reordered.splice(blockIndex, 1)
  reordered.splice(target, 0, moved!)
  return orderOf(reordered)
}

/** Nova ordem ao mover um membro dentro do próprio grupo; null nas bordas do grupo. */
export function moveWithinGroup<T extends GroupedItem>(items: T[], itemId: string, direction: -1 | 1): string[] | null {
  const block = planBlocks(items).find((entry) => entry.items.some((item) => item.id === itemId))
  if (!block || block.items.length < 2) return null
  const index = block.items.findIndex((item) => item.id === itemId)
  const target = index + direction
  if (target < 0 || target >= block.items.length) return null
  const members = [...block.items]
  const [moved] = members.splice(index, 1)
  members.splice(target, 0, moved!)
  return items.map((item) => item.id).map((id) => {
    const position = block.items.findIndex((member) => member.id === id)
    return position === -1 ? id : members[position]!.id
  })
}

export interface ItemPatch {
  id: string
  supersetGroup: string | null
}

/**
 * Liga o item ao seguinte.
 *
 * A chave de um grupo novo é o id do primeiro membro: dois aparelhos offline
 * criando o mesmo bi-set escrevem o mesmo valor e não conflitam. `freshKey` só
 * entra se esse id já estiver em uso como chave de outro grupo.
 */
export function linkWithNextPatches<T extends GroupedItem>(items: T[], itemId: string, freshKey: string): ItemPatch[] {
  const index = items.findIndex((item) => item.id === itemId)
  const next = items[index + 1]
  if (index === -1 || !next) return []

  const blocks = planBlocks(items)
  const sizeOf = (item: T | undefined) => (item?.supersetGroup
    ? blocks.find((block) => block.key === item.supersetGroup && block.items.includes(item))?.items.length ?? 1
    : 1)
  if (sizeOf(items[index]) + sizeOf(next) > MAX_SUPERSET_SIZE) return []

  const existing = items[index]!.supersetGroup ?? next.supersetGroup ?? null
  const taken = items.some((item) => item.supersetGroup === itemId && item.id !== itemId)
  const key = existing ?? (taken ? freshKey : itemId)
  return [items[index]!, next]
    .filter((item) => (item.supersetGroup ?? null) !== key)
    .map((item) => ({ id: item.id, supersetGroup: key }))
}

/** Tira o item do grupo e o coloca logo depois dele, para não partir os que ficam. */
export function leaveSupersetChange<T extends GroupedItem>(items: T[], itemId: string): { order: string[]; patches: ItemPatch[] } | null {
  const block = planBlocks(items).find((entry) => entry.items.some((item) => item.id === itemId))
  if (!block || block.items.length < 2) return null
  const remaining = block.items.filter((item) => item.id !== itemId)
  const order = items.flatMap((item) => {
    if (item.id === itemId) return []
    return item.id === remaining.at(-1)!.id ? [item.id, itemId] : [item.id]
  })
  // Sobrando um membro só, a chave dele deixa de significar grupo — mas fica:
  // não custa nada e devolve o grupo se o usuário desfizer o movimento.
  return { order, patches: [{ id: itemId, supersetGroup: null }] }
}

export function ungroupPatches<T extends GroupedItem>(block: PlanBlock<T>): ItemPatch[] {
  return block.items.map((item) => ({ id: item.id, supersetGroup: null }))
}
