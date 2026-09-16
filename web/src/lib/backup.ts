import { v7 as uuidv7 } from 'uuid'
import { fetchMediaBlob } from './api.js'
import { localDb, SYNC_STORES, type SyncEntity } from './db.js'
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
/**
 * O que uma linha de backup anterior ao recurso não traz.
 *
 * `mutate` mescla o arquivo POR CIMA da linha local, então sem o default o
 * agrupamento de hoje sobreviveria à restauração de um backup que não o tem —
 * inclusive no modo "substituir", que promete deixar só o arquivo.
 */
const RESTORE_DEFAULTS: Partial<Record<SyncEntity, Record<string, unknown>>> = {
  template_items: { supersetGroup: null },
}

export async function restoreBackup(
  backup: BackupDocument,
  ownerId: string,
  mode: 'merge' | 'replace',
): Promise<BackupSummary> {
  // A preferência é lida ANTES de apagar: é ela que diz em qual linha as
  // configurações do arquivo entram, e uma linha já apagada não seria achada.
  const currentSettings = (await localDb.table_('user_settings').toArray()).find((row) => !row.deletedAt)
  const restored = new Map<SyncEntity, Set<string>>()
  for (const entity of BACKUP_ENTITIES) {
    const ids = new Set((backup.entities[entity] ?? []).map((source) =>
      entity === 'user_settings' && currentSettings ? currentSettings.id : String(source.id)))
    if (ids.size > 0) restored.set(entity, ids)
  }

  // "Substituir" apaga só o que o arquivo NÃO traz. Apagar tudo e recriar os
  // mesmos ids parecia equivalente e não é: em entidade append-only o
  // servidor descarta o upsert numa linha existente, então a dor e os
  // resultados de teste voltariam apagados no próximo pull.
  if (mode === 'replace') await removeCurrentData(restored)
  let rows = 0

  for (const entity of BACKUP_ENTITIES) {
    for (const source of backup.entities[entity] ?? []) {
      const id = entity === 'user_settings' && currentSettings ? currentSettings.id : String(source.id)
      await mutate(entity, { ...RESTORE_DEFAULTS[entity], ...source, id, ownerId, deletedAt: null })
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

async function removeCurrentData(keep: Map<SyncEntity, Set<string>>) {
  await localDb.uploads.clear()
  for (const entity of [...SYNC_STORES].reverse()) {
    const rows = await localDb.table_(entity).toArray()
    const restored = keep.get(entity)
    for (const row of rows) {
      if (!row.deletedAt && !restored?.has(row.id)) await remove(entity, row.id)
    }
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
