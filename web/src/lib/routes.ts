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
export const historyRoute = (sessionId: string) => `${routes.history}/${sessionId}`
