import { v7 as uuidv7 } from 'uuid'
import { fetchMediaBlob } from './api.js'
import { localDb, SYNC_STORES } from './db.js'
import { mutate, remove } from './outbox.js'
import {
  BACKUP_ENTITIES, BACKUP_FORMAT, BACKUP_VERSION, portableRow,
  type BackupDocument, type BackupMedia, type BackupSummary,
} from './backup-format.js'

export { parseBackup } from './backup-format.js'
export type { BackupDocument, BackupSummary } from './backup-format.js'

/** Builds a portable account backup from the offline replica and private media. */
export async function buildBackup(): Promise<{ blob: Blob; summary: BackupSummary }> {
  const entities: BackupDocument['entities'] = {}
  for (const entity of BACKUP_ENTITIES) {
    const rows = await localDb.table_(entity).toArray()
    entities[entity] = rows.filter((row) => !row.deletedAt).map(portableRow)
  }

  const media = await exportMedia()
  const document: BackupDocument = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entities,
    media,
  }
  const rows = Object.values(entities).reduce((total, entries) => total + (entries?.length ?? 0), 0)
  return {
    blob: new Blob([JSON.stringify(document)], { type: 'application/json' }),
    summary: { rows, images: media.length, exportedAt: document.exportedAt },
  }
}

/** Restores a backup into the signed-in account and queues every change for sync. */
export async function restoreBackup(
  backup: BackupDocument,
  ownerId: string,
  mode: 'merge' | 'replace',
): Promise<BackupSummary> {
  if (mode === 'replace') await removeCurrentData()
  const currentSettings = (await localDb.table_('user_settings').toArray()).find((row) => !row.deletedAt)
  let rows = 0

  for (const entity of BACKUP_ENTITIES) {
    for (const source of backup.entities[entity] ?? []) {
      const id = entity === 'user_settings' && currentSettings ? currentSettings.id : String(source.id)
      await mutate(entity, { ...source, id, ownerId, deletedAt: null })
      rows += 1
    }
  }
  for (const media of backup.media) await queueMedia(media)
  return { rows, images: backup.media.length, exportedAt: backup.exportedAt }
}

async function exportMedia(): Promise<BackupMedia[]> {
  const files = new Map<string, BackupMedia>()
  const rows = await localDb.table_('exercise_media').toArray()
  for (const row of rows.filter((entry) => !entry.deletedAt)) {
    const blob = await fetchMediaBlob(String(row.id))
    files.set(String(row.exerciseId), {
      exerciseId: String(row.exerciseId),
      filename: `${row.exerciseId}.webp`,
      mime: blob.type || 'image/webp',
      dataUrl: await blobToDataUrl(blob),
    })
  }
  for (const pending of await localDb.uploads.toArray()) {
    files.set(pending.exerciseId, {
      exerciseId: pending.exerciseId,
      filename: pending.filename,
      mime: pending.blob.type || 'image/webp',
      dataUrl: await blobToDataUrl(pending.blob),
    })
  }
  return [...files.values()]
}

async function removeCurrentData() {
  await localDb.uploads.clear()
  for (const entity of [...SYNC_STORES].reverse()) {
    const rows = await localDb.table_(entity).toArray()
    for (const row of rows) if (!row.deletedAt) await remove(entity, row.id)
  }
}

async function queueMedia(media: BackupMedia) {
  const response = await fetch(media.dataUrl)
  const blob = await response.blob()
  await localDb.transaction('rw', localDb.uploads, async () => {
    await localDb.uploads.where('exerciseId').equals(media.exerciseId).delete()
    await localDb.uploads.put({
      id: uuidv7(),
      exerciseId: media.exerciseId,
      blob,
      filename: media.filename,
      queuedAt: new Date().toISOString(),
    })
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
