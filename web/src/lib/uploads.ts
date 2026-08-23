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
      // Grava local na hora: a imagem aparece sem esperar o próximo pull.
      await localDb.table_('exercise_media').put(media as never)
      await localDb.uploads.delete(upload.id)
      sent += 1
    } catch (error) {
      // Exercício apagado ou arquivo rejeitado: descartar, senão a fila trava
      // para sempre num item que nunca vai passar.
      const status = (error as { status?: number }).status
      if (status === 404 || status === 400) await localDb.uploads.delete(upload.id)
      else break
    }
  }

  return sent
}
