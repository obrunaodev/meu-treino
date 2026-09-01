import { localDb } from './db.js'
import { SET_LOG_HEADERS, csvBlob, toCsv } from './domain/csv.js'
import type {
  Equipment, Exercise, SetLog, Template, WorkoutSession,
} from './types.js'

/**
 * Uma linha por série, com o contexto desnormalizado junto. O usuário abre
 * isso numa planilha sem precisar cruzar tabelas — o ponto do export é
 * levar o histórico embora, não espelhar o schema.
 */
export async function buildSetLogCsv(): Promise<Blob> {
  const rowsOf = <T>(entity: Parameters<typeof localDb.table_>[0]) =>
    localDb.table_(entity).toArray() as unknown as Promise<T[]>

  const [sessions, sets, exercises, equipment, templates] = await Promise.all([
    rowsOf<WorkoutSession>('workout_sessions'),
    rowsOf<SetLog>('set_logs'),
    rowsOf<Exercise>('exercises'),
    rowsOf<Equipment>('equipment'),
    rowsOf<Template>('templates'),
  ])

  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const exerciseById = new Map(exercises.map((e) => [e.id, e]))
  const equipmentById = new Map(equipment.map((e) => [e.id, e]))
  const templateById = new Map(templates.map((t) => [t.id, t]))

  const rows = sets
    .filter((set) => !set.deletedAt)
    .sort((a, b) => {
      const sa = sessionById.get(a.sessionId)?.startedAt ?? ''
      const sb = sessionById.get(b.sessionId)?.startedAt ?? ''
      return sa.localeCompare(sb) || a.setIndex - b.setIndex
    })
    .map((set) => {
      const session = sessionById.get(set.sessionId)
      const exercise = exerciseById.get(set.exerciseId)
      const snapshotItem = session?.planSnapshot?.items.find((item) => item.exerciseId === set.exerciseId)
      const gear = snapshotItem?.equipment ?? (exercise?.equipmentId ? equipmentById.get(exercise.equipmentId) : null)

      return [
        set.sessionId,
        session?.startedAt ?? '',
        session?.periodNumber ?? 1,
        session?.blockNumber ?? '',
        session?.cycleNumber ?? '',
        session ? session.planSnapshot?.templateName ?? templateById.get(session.templateId)?.name ?? '' : '',
        session?.status ?? '',
        snapshotItem?.exerciseName ?? exercise?.name ?? '',
        gear?.name ?? '',
        set.setIndex + 1,
        set.isWarmup ? 'sim' : 'nao',
        set.side,
        set.weightKg ?? '',
        (snapshotItem?.loadPerSide ?? exercise?.loadPerSide) ? 'sim' : 'nao',
        set.plateCount ?? '',
        set.reps ?? '',
        set.seconds ?? '',
        set.rir ?? '',
        set.skipped ? 'sim' : 'nao',
        set.hadPain ? 'sim' : 'nao',
        set.completedAt ?? '',
      ]
    })

  return csvBlob(toCsv(SET_LOG_HEADERS, rows))
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // Revogar imediatamente cancelaria o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
