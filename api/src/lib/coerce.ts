import { getTableColumns } from 'drizzle-orm'
import { SYNC_TABLES, type SyncEntity } from '../db/sync-tables.js'
import { badRequest } from './http-error.js'

/** Nunca vêm do cliente: quem escreve é o servidor. */
const SERVER_OWNED = new Set(['rev', 'ownerId', 'createdAt', 'purgedAt'])

interface ColumnMeta {
  dataType: string
  columnType: string
}

const columnsByEntity = new Map<SyncEntity, Record<string, ColumnMeta>>()

function columnsOf(entity: SyncEntity) {
  let columns = columnsByEntity.get(entity)
  if (!columns) {
    columns = getTableColumns(SYNC_TABLES[entity].table) as unknown as Record<string, ColumnMeta>
    columnsByEntity.set(entity, columns)
  }
  return columns
}

/**
 * O payload do sync atravessa JSON, onde não existe Date: um timestamp chega
 * como string ISO e o Drizzle estoura ao tentar `.toISOString()` nela.
 * Convertemos pelo tipo declarado no schema, então tabela nova já nasce coberta.
 *
 * De quebra, chaves que não são coluna são descartadas — o cliente não escreve
 * campo que o servidor não conhece.
 */
export function coerceRow(entity: SyncEntity, row: Record<string, unknown>) {
  const columns = columnsOf(entity)
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    const column = columns[key]
    if (!column || SERVER_OWNED.has(key)) continue

    if (column.dataType === 'date' && typeof value === 'string') {
      const parsed = new Date(value)
      if (Number.isNaN(parsed.getTime())) throw badRequest('data_invalida', { campo: key })
      out[key] = parsed
      continue
    }
    out[key] = value
  }

  return out
}

/** Espelho do coerceRow para a base do merge, que chega pelo mesmo caminho. */
export function coerceBase(entity: SyncEntity, base: Record<string, unknown> | null) {
  return base ? coerceRow(entity, base) : null
}

/**
 * Converte a linha do banco para o formato que o cliente espera.
 *
 * O driver do Postgres entrega `numeric` como string — "60.00" — para não
 * perder precisão em valores que não cabem num double. Os nossos cabem
 * (8 dígitos, 2 casas), e o cliente grava esses campos como número: sem a
 * conversão aqui, a mesma carga vira 60 quando criada localmente e "60.00"
 * quando volta do sync, e a primeira conta quebra.
 *
 * Deriva do schema, então coluna numérica nova já nasce coberta.
 */
export function serializeRow(entity: SyncEntity, row: Record<string, unknown>) {
  const columns = columnsOf(entity)
  const out: Record<string, unknown> = { ...row }

  for (const [key, meta] of Object.entries(columns)) {
    if (meta.columnType !== 'PgNumeric') continue
    const value = out[key]
    if (typeof value !== 'string') continue

    const parsed = Number(value)
    // NaN só aconteceria com dado corrompido; deixar passar como veio é melhor
    // que trocar por zero e mentir sobre a carga registrada.
    out[key] = Number.isFinite(parsed) ? parsed : value
  }

  return out
}
