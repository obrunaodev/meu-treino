/**
 * Bi-set e tri-set derivados da ordem, com a mesma regra do app
 * (web/src/lib/domain/supersets.ts). O bot não compartilha código com o web — a
 * imagem só copia bot/src —, então a regra é gêmea e os testes usam os mesmos
 * casos dos dois lados para que não se afastem.
 */

export interface GroupedItem {
  supersetGroup: string | null
}

export interface PlanBlock<T> {
  key: string | null
  items: T[]
}

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

export function supersetKind(size: number): 'biset' | 'triset' | 'giant' | null {
  if (size < 2) return null
  if (size === 2) return 'biset'
  return size === 3 ? 'triset' : 'giant'
}

const KIND_LABEL = { biset: 'Bi-set', triset: 'Tri-set', giant: 'Série gigante' } as const

/** Cabeçalho do grupo na listagem do treino; null para item solto. */
export function supersetHeading(size: number): string | null {
  const kind = supersetKind(size)
  return kind === null ? null : `🔗 *${KIND_LABEL[kind]} — alterne as séries*`
}
