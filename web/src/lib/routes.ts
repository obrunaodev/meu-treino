/** Canonical web routes use stable en-US URL segments, independent of UI locale. */
export const routes = {
  dashboard: '/',
  onboarding: '/onboarding',
  authCallback: '/auth/callback',
  session: '/session',
  workouts: '/workouts',
  exercises: '/exercises',
  equipment: '/equipment',
  pain: '/pain',
  functionalTests: '/functional-tests',
  history: '/history',
  settings: '/settings',
  conflicts: '/conflicts',
  whatsapp: '/whatsapp',
  more: '/more',
} as const

export const sessionRoute = (sessionId: string) => `${routes.session}/${sessionId}`
export const sessionExerciseRoute = (sessionId: string, itemId: string) => `${sessionRoute(sessionId)}/exercise/${itemId}`
export const historyRoute = (sessionId: string) => `${routes.history}/${sessionId}`
export const cycleReportRoute = (programId: string, cycleNumber: number) =>
  `${routes.history}/reports/cycle/${programId}/${cycleNumber}`
export const blockReportRoute = (programId: string, periodNumber: number, blockNumber: number) =>
  `${routes.history}/reports/period/${periodNumber}/block/${programId}/${blockNumber}`
