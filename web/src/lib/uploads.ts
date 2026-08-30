import { useLiveQuery } from 'dexie-react-hooks'
import { apiFetch } from './api.js'
import { localDb } from './db.js'
import type { ExerciseMedia } from './types.js'

/**
 * A foto é tirada na academia, onde a rede é ruim ou não existe. Então o
 * upload nunca é síncrono: o blob vai para o IndexedDB e sobe quando der.
 */
export function usePendingUploads() {
  return useLiveQuery(() => localDb.uploads.toArray(), []) ?? []
}

export async function flushUploads(): Promise<number> {
  if (!navigator.onLine) return 0

  const pending = await localDb.uploads.orderBy('queuedAt').toArray()
  let sent = 0

  for (const upload of pending) {
    const form = new FormData()
    form.append('file', upload.blob, upload.filename)

    try {
      const media = await apiFetch<ExerciseMedia>(`/api/media/exercises/${upload.exerciseId}`, {
        method: 'POST',
        body: form,
      })
      const mediaTable = localDb.table_('exercise_media')
      await localDb.transaction('rw', mediaTable, localDb.uploads, async () => {
        // O servidor já apagou as anteriores. Espelhar isso na mesma transação
        // evita que a UI mostre duas imagens até o próximo pull.
        const current = await mediaTable.toArray()
        const deletedAt = new Date().toISOString()
        for (const row of current) {
          if (row.exerciseId === upload.exerciseId && !row.deletedAt) {
            await mediaTable.put({ ...row, deletedAt } as never)
          }
        }
        await mediaTable.put(media as never)
        await localDb.uploads.delete(upload.id)
      })
      sent += 1
    } catch (error) {
      // Arquivo rejeitado nunca vai passar. Já 404 pode ser só o exercício
      // local ainda chegando pelo sync; manter na fila permite tentar depois.
      const status = (error as { status?: number }).status
      if (status === 400) await localDb.uploads.delete(upload.id)
      else break
    }
  }

  return sent
}
