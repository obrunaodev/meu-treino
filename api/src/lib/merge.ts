export type Row = Record<string, unknown>

export type MergeOutcome =
  | { kind: 'apply'; row: Row }
  | { kind: 'noop' }
  | { kind: 'conflict'; row: Row; conflictingFields: string[] }

/**
 * Fora do diff. `rev`, `ownerId` e `createdAt` são do servidor.
 *
 * `updatedAt` é o caso sutil: o cliente carimba a cada mutação, então ele
 * SEMPRE difere quando os dois lados editaram — e todo merge concorrente
 * viraria conflito manual por causa de um metadado. No servidor quem manda
 * nele é o trigger, não o payload.
 */
const SERVER_OWNED = new Set([
  'rev', 'ownerId', 'owner_id', 'createdAt', 'created_at', 'updatedAt', 'updated_at',
])

/**
 * Comparação estrutural rasa o bastante para os tipos que trafegam no sync:
 * escalares, datas e arrays/objetos JSON pequenos (cues, plateTable, weekdays).
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  // numeric do Postgres volta como string; o cliente manda number.
  if (typeof a === 'number' && typeof b === 'string') return sameNumber(a, b)
  if (typeof a === 'string' && typeof b === 'number') return sameNumber(b, a)
  return false
}

/**
 * Compara pelo valor, não pelo texto.
 *
 * `numeric(7,2)` volta do driver com a escala escrita — "60.00" — e o cliente
 * manda 60. Comparar como string diz que mudaram, e o merge então acusa
 * conflito em campo que ninguém tocou dos dois lados.
 */
function sameNumber(value: number, text: string): boolean {
  if (text.trim() === '') return false
  const parsed = Number(text)
  return Number.isFinite(parsed) && parsed === value
}

function mergeableFields(...rows: Row[]): string[] {
  const keys = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!SERVER_OWNED.has(key)) keys.add(key)
    }
  }
  return [...keys]
}

/**
 * Merge de três pontas, campo a campo.
 *
 * `base` é a versão que o cliente tinha quando ficou offline. Sem ela não dá
 * para distinguir "o cliente mudou este campo" de "o cliente só devolveu o que
 * leu" — e o merge degeneraria em last-write-wins, que é justamente o que
 * queremos evitar.
 *
 * Um campo só vira conflito manual quando os DOIS lados o alteraram para
 * valores diferentes. O resto é aplicado, então o usuário nunca perde trabalho
 * enquanto decide.
 */
export function threeWayMerge(base: Row | null, current: Row, incoming: Row): MergeOutcome {
  // Sem base o cliente é a primeira escrita que o servidor vê deste registro.
  if (!base) {
    return sameShape(current, incoming) ? { kind: 'noop' } : { kind: 'apply', row: incoming }
  }

  const merged: Row = {}
  const conflicting: string[] = []

  for (const field of mergeableFields(base, current, incoming)) {
    const wasChangedByClient = !sameValue(incoming[field], base[field])
    const wasChangedByServer = !sameValue(current[field], base[field])

    if (!wasChangedByClient) continue
    if (!wasChangedByServer) {
      merged[field] = incoming[field]
      continue
    }
    if (sameValue(incoming[field], current[field])) continue

    conflicting.push(field)
  }

  if (conflicting.length > 0) {
    return { kind: 'conflict', row: merged, conflictingFields: conflicting.sort() }
  }
  return Object.keys(merged).length === 0 ? { kind: 'noop' } : { kind: 'apply', row: merged }
}

function sameShape(a: Row, b: Row): boolean {
  return mergeableFields(a, b).every((f) => sameValue(a[f], b[f]))
}

/**
 * Delete de um lado, edit do outro: o edit ressuscita a linha.
 *
 * Apagar é barato de refazer; recuperar uma edição perdida é impossível. Vale
 * para os dois sentidos — quem editou depois do delete, e quem editou offline
 * enquanto o outro dispositivo apagava.
 */
export function resolveDeleteVsEdit(
  serverDeleted: boolean,
  clientDeleted: boolean,
  clientEditedFields: number,
): 'delete' | 'resurrect' | 'keep' {
  if (serverDeleted && !clientDeleted && clientEditedFields > 0) return 'resurrect'
  if (clientDeleted && !serverDeleted) return 'delete'
  if (clientDeleted && serverDeleted) return 'keep'
  return 'keep'
}
