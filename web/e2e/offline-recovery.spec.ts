import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

const API = process.env.API_URL ?? 'http://localhost:3000'
const TOKEN = process.env.DEV_LOGIN_TOKEN ?? ''

for (const width of [390, 980]) {
  test(`restores checked sets after an offline cold start at ${width}px`, async ({ page, context }) => {
    test.skip(!TOKEN, 'requires temporary test login')
    await page.setViewportSize({ width, height: 844 })
    const login = await context.request.post(`${API}/auth/dev-login`, { data: { token: TOKEN, email: `offline-${randomUUID()}@example.com` } })
    expect(login.ok()).toBe(true)
    const { accessToken } = await login.json()
    const program = randomUUID(), template = randomUUID(), exercise = randomUUID(), item = randomUUID(), session = randomUUID()
    const rows = [
      ['programs', program, { name: 'Offline test', isActive: true, sessionsPerCycle: 1, cyclesPerBlock: 4 }],
      ['templates', template, { programId: program, position: 0, name: 'A' }],
      ['exercises', exercise, { name: 'Squat', cues: [] }],
      ['template_items', item, { templateId: template, exerciseId: exercise, position: 0, sets: 3, repMin: 8, repMax: 12, rirTarget: 2 }],
      ['workout_sessions', session, { programId: program, templateId: template, status: 'em_andamento', startedAt: new Date().toISOString() }],
    ] as const
    const seeded = await context.request.post(`${API}/api/sync`, {
      headers: { authorization: `Bearer ${accessToken}` },
      data: { deviceId: randomUUID(), operations: rows.map(([entity, entityId, data]) => ({ opId: randomUUID(), entity, entityId, data, op: 'upsert' })) },
    })
    expect(seeded.ok()).toBe(true)
    await page.goto(`/session/${session}/exercise/${item}`)
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
    await page.reload()
    const load = page.getByRole('spinbutton', { name: /carga/i }).first()
    await load.fill('65')
    await page.getByRole('button', { name: /^Marcar série 1 como concluída$/i }).click()
    await expect.poll(() => page.evaluate(async ({ session, item }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('meu-treino')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const result = await new Promise<boolean>((resolve) => {
        const request = db.transaction('meta').objectStore('meta').get(`session-drafts:${session}`)
        request.onsuccess = () => resolve(request.result?.value?.[item]?.[0]?.checked === true)
      })
      db.close()
      return result
    }, { session, item })).toBe(true)
    await context.setOffline(true)
    await page.reload()
    await expect(load).toHaveValue('65')
    await expect(page.getByRole('button', { name: /^Desmarcar série 1$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /finalizar exercício/i })).toBeDisabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await context.setOffline(false)
    await page.reload()
    await expect(load).toHaveValue('65')
  })
}
