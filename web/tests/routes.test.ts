import { describe, expect, it } from 'vitest'
import { historyRoute, routes, sessionRoute } from '../src/lib/routes.js'

describe('canonical web routes', () => {
  it('uses stable en-US segments', () => {
    expect(routes).toEqual({
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
    })
  })

  it('builds resource detail paths from canonical segments', () => {
    expect(sessionRoute('session-id')).toBe('/session/session-id')
    expect(historyRoute('session-id')).toBe('/history/session-id')
  })
})
