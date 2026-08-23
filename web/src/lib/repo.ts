import { useLiveQuery } from 'dexie-react-hooks'
import { localDb, type SyncEntity } from './db.js'
import type {
  CardioLog, CardioOption, Equipment, Exercise, ExerciseMedia, ExerciseSubstitution, FunctionalTest,
  Gym, PainEvent, Program, SetLog, Template, TemplateItem, TestResult, UserSettings,
  WorkoutSession,
} from './types.js'

/**
 * Leitura reativa do IndexedDB. Toda tela lê daqui — nunca da rede — que é o
 * que faz a academia sem sinal se comportar igual ao desktop.
 *
 * O filtro de `deletedAt` mora aqui, num lugar só: soft delete é obrigatório
 * para o sync, mas a UI não deveria ter que lembrar disso em toda consulta.
 */
function live<T>(entity: SyncEntity, deps: unknown[] = []): T[] | undefined {
  return useLiveQuery(
    async () => {
      const rows = await localDb.table_(entity).toArray()
      return rows.filter((row) => !row.deletedAt) as T[]
    },
    deps,
  )
}

const byPosition = <T extends { position: number }>(rows: T[]) =>
  [...rows].sort((a, b) => a.position - b.position)

export function useGyms() {
  return live<Gym>('gyms') ?? []
}

export function useEquipment() {
  const rows = live<Equipment>('equipment') ?? []
  return [...rows].sort((a, b) => a.name.localeCompare(b.name))
}

export function useCardioOptions() {
  const rows = live<CardioOption>('cardio_options') ?? []
  return [...rows].sort((a, b) => a.name.localeCompare(b.name))
}

export function useEquipmentById(id: string | null | undefined) {
  return useEquipment().find((e) => e.id === id) ?? null
}

export function useExercises() {
  const rows = live<Exercise>('exercises') ?? []
  return [...rows].sort((a, b) => a.name.localeCompare(b.name))
}

export function useExerciseById(id: string | null | undefined) {
  return useExercises().find((e) => e.id === id) ?? null
}

export function useMedia() {
  return byPosition(live<ExerciseMedia>('exercise_media') ?? [])
}

export function useMediaFor(exerciseId: string | null | undefined) {
  return useMedia().filter((m) => m.exerciseId === exerciseId)
}

export function useSubstitutions() {
  return live<ExerciseSubstitution>('exercise_substitutions') ?? []
}

/** Um programa ativo por vez; os outros ficam guardados como histórico. */
export function useActiveProgram(): Program | null {
  const programs = live<Program>('programs') ?? []
  return programs.find((p) => p.isActive) ?? null
}

export function useTemplates(programId: string | null | undefined) {
  const rows = live<Template>('templates') ?? []
  return byPosition(rows.filter((t) => t.programId === programId))
}

/**
 * Inclui os apagados. O histórico precisa nomear o treino que foi feito, e um
 * treino removido depois não pode transformar as sessões antigas em "—".
 */
export function useTemplatesEver(): Template[] {
  return useLiveQuery(
    async () => (await localDb.table_('templates').toArray()) as unknown as Template[],
    [],
  ) ?? []
}

export function useTemplateItems(templateId: string | null | undefined) {
  const rows = live<TemplateItem>('template_items') ?? []
  return byPosition(rows.filter((i) => i.templateId === templateId))
}

export function useAllTemplateItems() {
  return live<TemplateItem>('template_items') ?? []
}

export function useSessions() {
  const rows = live<WorkoutSession>('workout_sessions') ?? []
  return [...rows].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

/** Só pode haver uma sessão aberta; se houver mais, a mais recente vale. */
export function useOpenSession(): WorkoutSession | null {
  return useSessions().filter((s) => s.status === 'em_andamento').at(-1) ?? null
}

export function useSetLogs(sessionId?: string | null) {
  const rows = live<SetLog>('set_logs') ?? []
  const filtered = sessionId ? rows.filter((s) => s.sessionId === sessionId) : rows
  return [...filtered].sort((a, b) => a.setIndex - b.setIndex)
}

export function useCardioLogs(sessionId?: string | null) {
  const rows = live<CardioLog>('cardio_logs') ?? []
  return sessionId ? rows.filter((c) => c.sessionId === sessionId) : rows
}

export function usePainEvents() {
  const rows = live<PainEvent>('pain_events') ?? []
  return [...rows].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}

export function useFunctionalTests() {
  const rows = live<FunctionalTest>('functional_tests') ?? []
  return [...rows].sort((a, b) => a.name.localeCompare(b.name))
}

export function useTestResults(testId?: string | null) {
  const rows = live<TestResult>('test_results') ?? []
  const filtered = testId ? rows.filter((r) => r.testId === testId) : rows
  return [...filtered].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
}

export function useSettings(): UserSettings | null {
  return (live<UserSettings>('user_settings') ?? [])[0] ?? null
}

/**
 * Últimas exposições de carga de um exercício, do mais antigo ao mais recente.
 * É o insumo do gráfico de evolução e da leitura de platô.
 */
export function useLoadHistory(exerciseId: string | null | undefined, limit = 12) {
  const logs = useSetLogs()
  const sessions = useSessions()

  const byId = new Map(sessions.map((s) => [s.id, s]))
  const relevant = logs
    .filter((l) => l.exerciseId === exerciseId && !l.isWarmup && !l.skipped && l.weightKg !== null)
    .filter((l) => byId.has(l.sessionId))

  const perSession = new Map<string, { at: string; topKg: number }>()
  for (const log of relevant) {
    const session = byId.get(log.sessionId)!
    const current = perSession.get(log.sessionId)
    // A exposição vale pela série mais pesada do dia, não pela média.
    const topKg = Math.max(current?.topKg ?? 0, log.weightKg ?? 0)
    perSession.set(log.sessionId, { at: session.startedAt, topKg })
  }

  return [...perSession.values()]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-limit)
}
