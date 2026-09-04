import { describe, expect, it } from 'vitest'
import { blockReportRoute, cycleReportRoute, historyRoute, routes, sessionRoute } from '../src/lib/routes.js'

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
    expect(cycleReportRoute('program-id', 3)).toBe('/history/reports/cycle/program-id/3')
    expect(blockReportRoute('program-id', 2, 4)).toBe('/history/reports/period/2/block/program-id/4')
  })
})
