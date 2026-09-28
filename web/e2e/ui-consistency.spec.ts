import { randomUUID } from 'node:crypto'
import { expect, test, type BrowserContext } from '@playwright/test'

const API = process.env.API_URL ?? 'http://localhost:3000'
const TOKEN = process.env.DEV_LOGIN_TOKEN ?? ''

async function seed(context: BrowserContext, theme: string, locale: string) {
  const login = await context.request.post(`${API}/auth/dev-login`, {
    data: { token: TOKEN, email: `ui-${randomUUID()}@example.com` },
  })
  expect(login.ok()).toBe(true)
  const { accessToken } = await login.json()
  const initial = await context.request.post(`${API}/api/sync`, {
    headers: { authorization: `Bearer ${accessToken}` }, data: { deviceId: randomUUID(), operations: [] },
  })
  const settingsId = (await initial.json()).changes.user_settings[0].id
  const ids = Object.fromEntries(['program', 'template', 'exercise', 'item', 'session', 'test'].map((key) => [key, randomUUID()]))
  const startedAt = new Date(Date.now() - 86_400_000).toISOString()
  const rows: Array<[string, string, object]> = [
    ['programs', ids.program!, { name: 'Programa de força e condicionamento', isActive: true, sessionsPerCycle: 3 }],
    ['templates', ids.template!, { programId: ids.program, name: 'Treino A · força e condicionamento', position: 0 }],
    ['exercises', ids.exercise!, { name: 'Agachamento com barra', cues: ['Mantenha o controle do movimento.'] }],
    ['template_items', ids.item!, { templateId: ids.template, exerciseId: ids.exercise, position: 0, sets: 3, repMin: 8, repMax: 12, rirTarget: 2 }],
    ['workout_sessions', ids.session!, { programId: ids.program, templateId: ids.template, status: 'concluida', startedAt, endedAt: startedAt }],
    ['set_logs', randomUUID(), { sessionId: ids.session, templateItemId: ids.item, exerciseId: ids.exercise, setIndex: 0, weightKg: 60, reps: 10, rir: 2, completedAt: startedAt }],
    ['functional_tests', ids.test!, { name: 'Equilíbrio em apoio unilateral', unit: 's' }],
    ['test_results', randomUUID(), { testId: ids.test, value: 30, measuredAt: startedAt }],
    ['body_measurements', randomUUID(), { kind: 'peso', value: 80, measuredOn: startedAt.slice(0, 10) }],
    ['user_settings', settingsId, { theme, locale }],
  ]
  const response = await context.request.post(`${API}/api/sync`, {
    headers: { authorization: `Bearer ${accessToken}` },
    data: { deviceId: randomUUID(), operations: rows.map(([entity, entityId, data]) => ({ opId: randomUUID(), entity, entityId, data, op: 'upsert' })) },
  })
  expect(response.ok()).toBe(true)
  expect((await response.json()).results.map((result: { status: string }) => result.status))
    .toEqual([...rows.slice(0, -1).map(() => 'created'), 'applied'])
  return ids
}

for (const width of [390, 980]) for (const theme of ['dark', 'light']) for (const locale of ['pt-BR', 'en-US']) {
  test(`consistent screens at ${width}px / ${theme} / ${locale}`, async ({ page, context }, info) => {
    test.skip(!TOKEN, 'requires isolated API and temporary login')
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height: 900 })
    const ids = await seed(context, theme, locale)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    // Review the UI without connecting a WhatsApp account or granting a real
    // administrator role. These two remote-service boundaries use fixtures.
    await page.route('**/auth/me', async (route) => {
      const response = await route.fetch()
      await route.fulfill({ response, json: { ...await response.json(), roles: ['admin'] } })
    })
    await page.route('**/api/whatsapp/status', (route) => route.fulfill({ json: {
      state: 'disconnected', qrDataUrl: null, phone: null, selectedGroupJid: null, selectedGroupName: null,
    } }))
    await page.route('**/api/admin/presets', (route) => route.fulfill({ json: { presets: [] } }))
    const routes = ['/', '/session', '/workouts', '/exercises', '/equipment', '/pain', '/body', '/functional-tests',
      '/history', `/history/${ids.session}`, `/history/${ids.session}/edit`, `/history/exercises/${ids.exercise}`,
      `/history/reports/period/1/block/${ids.program}/1`, '/settings', '/conflicts', '/whatsapp', '/more', '/admin/presets']
    for (const path of routes) {
      await page.goto(path)
      await expect(page.locator('h1')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      if (path === '/') {
        await page.keyboard.press('Tab')
        await expect(page.locator('.skip-link')).toBeFocused()
        await expect(page.locator('.skip-link')).toHaveCSS('clip-path', 'none')
        await page.keyboard.press('Enter')
        await expect(page.locator('#main-content')).toBeFocused()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true)
      const unnamed = await page.locator('input:not([hidden]), select, textarea').evaluateAll((elements) => elements
        .filter((element) => element.getBoundingClientRect().width > 0 && !element.getAttribute('aria-label') && !element.getAttribute('aria-labelledby') && !(element as HTMLInputElement).labels?.length)
        .map((element) => element.outerHTML))
      expect(unnamed, `labels on ${path}`).toEqual([])
      const nav = page.locator(width < 896 ? '.shell__tabs' : '.shell__side')
      if (!['/conflicts', '/more'].includes(path) || width < 896) await expect(nav.locator('[aria-current="page"]'), path).toHaveCount(1)
      if (width < 896) {
        const heights = await nav.locator('a').evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height))
        expect(heights.every((height) => height >= 44)).toBe(true)
      }
      if (['/', '/functional-tests', '/body', '/more', '/settings', '/admin/presets'].includes(path)) {
        await page.screenshot({ path: info.outputPath(`${path.slice(1).replaceAll('/', '-') || 'dashboard'}.png`), fullPage: true })
      }
    }
    await page.getByRole('button', { name: locale === 'pt-BR' ? 'Criar modelo' : 'Create preset' }).click()
    await expect(page.locator('.admin-preset-editor')).toBeVisible()
    await page.getByRole('button', { name: locale === 'pt-BR' ? '+ adicionar exercício' : '+ add exercise', exact: true }).first().click()
    await expect(page.locator('.admin-preset-item')).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath('admin-editor.png'), fullPage: true })
    expect(errors).toEqual([])
  })
}
