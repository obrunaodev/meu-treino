import { SYNC_STORES, type SyncEntity, type SyncRow } from './db.js'

export const BACKUP_FORMAT = 'meu-treino-backup'
export const BACKUP_VERSION = 1
export const MAX_BACKUP_BYTES = 250 * 1024 * 1024
export const BACKUP_ENTITIES = SYNC_STORES.filter((entity) => entity !== 'exercise_media')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface BackupMedia {
  exerciseId: string
  filename: string
  mime: string
  dataUrl: string
}

export interface BackupDocument {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  entities: Partial<Record<SyncEntity, Array<Record<string, unknown>>>>
  media: BackupMedia[]
}

export interface BackupSummary {
  rows: number
  images: number
  exportedAt: string
}

/** Removes account and synchronization metadata from an exported row. */
export function portableRow(row: SyncRow): Record<string, unknown> {
  const { ownerId: _owner, rev: _rev, createdAt: _created, updatedAt: _updated, deletedAt: _deleted, ...data } = row
  return data
}

/** Parses the versioned backup envelope before any local data is changed. */
export function parseBackup(raw: string, byteLength = new Blob([raw]).size): BackupDocument {
  if (byteLength > MAX_BACKUP_BYTES) throw new Error('backup_too_large')
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('backup_invalid_json')
  }
  if (!isRecord(value) || value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION) {
    throw new Error('backup_invalid_format')
  }
  if (typeof value.exportedAt !== 'string' || Number.isNaN(new Date(value.exportedAt).getTime()) ||
      !isRecord(value.entities) || !Array.isArray(value.media)) {
    throw new Error('backup_invalid_format')
  }

  const entities: BackupDocument['entities'] = {}
  for (const entity of BACKUP_ENTITIES) {
    const rows = value.entities[entity]
    if (!Array.isArray(rows)) throw new Error('backup_invalid_format')
    entities[entity] = rows.map(validateRow)
  }
  const media = value.media.map(validateMedia)
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: value.exportedAt,
    entities,
    media,
  }
}

function validateRow(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || typeof value.id !== 'string' || !UUID.test(value.id)) {
    throw new Error('backup_invalid_row')
  }
  return portableRow(value as SyncRow)
}

function validateMedia(value: unknown): BackupMedia {
  if (!isRecord(value) || typeof value.exerciseId !== 'string' || !UUID.test(value.exerciseId) ||
      typeof value.filename !== 'string' || typeof value.mime !== 'string' || !IMAGE_MIMES.has(value.mime) ||
      typeof value.dataUrl !== 'string' || !value.dataUrl.startsWith(`data:${value.mime};base64,`)) {
    throw new Error('backup_invalid_media')
  }
  return value as unknown as BackupMedia
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
