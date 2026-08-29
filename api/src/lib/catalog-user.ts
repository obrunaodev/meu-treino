/** Indexa uma cópia do catálogo por chave e prefere a linha ativa quando há legado apagado. */
export function preferAlive<T extends { deletedAt: Date | null }>(
  rows: T[],
  keyOf: (row: T) => string | number | null,
) {
  const result = new Map<string | number, T>()
  for (const row of rows) {
    const key = keyOf(row)
    if (key === null) continue
    const current = result.get(key)
    if (!current || (current.deletedAt !== null && row.deletedAt === null)) result.set(key, row)
  }
  return result
}
