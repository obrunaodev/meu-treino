import { v5 as uuidv5 } from 'uuid'
import { localDb } from './db.js'
import type { BackupDocument } from './backup-format.js'

const REFERENCES = new Set([
  'id', 'gymId', 'equipmentId', 'exerciseId', 'substituteExerciseId', 'programId',
  'templateId', 'templateItemId', 'sessionId', 'setLogId', 'testId', 'cardioOptionId', 'supersetGroup',
])

/** Remaps account-owned identities, including snapshot and media references. */
export async function backupForAccount(backup: BackupDocument, ownerId: string): Promise<BackupDocument> {
  if (backup.sourceOwnerId === ownerId) return backup
  const ids = new Map<string, string>()
  for (const [entity, rows] of Object.entries(backup.entities)) {
    const catalogField = entity === 'exercises' ? 'catalogExerciseId' : entity === 'equipment' ? 'catalogStationCode' : null
    const existingRows = await localDb.table(entity).toArray()
    for (const row of rows) {
      const id = String(row.id)
      const existing = existingRows.find((entry) => entry.id === id)
      const catalogMatch = catalogField && row[catalogField] !== null && row[catalogField] !== undefined
        ? existingRows.find((entry) => entry.ownerId === ownerId && !entry.deletedAt && entry[catalogField] === row[catalogField]) : null
      // Legacy files lack an owner. Retain a known local identity, otherwise
      // use a stable destination namespace so repeat imports remain idempotent.
      const retain = !backup.sourceOwnerId && existing?.ownerId === ownerId
      ids.set(id, catalogMatch ? catalogMatch.id : retain ? id : uuidv5(`${ownerId}:${id}`, uuidv5.URL))
    }
  }
  function remap(value: unknown, key = ''): unknown {
    if (key === 'ownerId') return ownerId
    if (typeof value === 'string' && REFERENCES.has(key)) {
      return ids.get(value) ?? uuidv5(`${ownerId}:${value}`, uuidv5.URL)
    }
    if (Array.isArray(value)) return value.map((entry) => remap(entry))
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([field, entry]) => [field, remap(entry, field)]))
    }
    return value
  }
  return { ...backup, entities: remap(backup.entities) as BackupDocument['entities'], media: remap(backup.media) as BackupDocument['media'] }
}
