import { expect, test } from '@playwright/test'

/**
 * Medidas corporais de ponta a ponta: registrar, ver na lista e sobreviver a
 * um reload — que é o que prova que a medida foi para o IndexedDB e voltou.
 */

const TOKEN = process.env.DEV_LOGIN_TOKEN ?? ''

test('registra uma medida e a encontra depois de recarregar', async ({ page }) => {
  test.skip(!TOKEN, 'precisa de DEV_LOGIN_TOKEN e do login provisório ativo')

  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(`corpo-${Date.now()}@exemplo.com`)
  await page.getByLabel(/token/i).fill(TOKEN)
  await page.getByRole('button', { name: /^entrar$/i }).click()
  await expect(page.getByRole('heading', { name: /como você quer começar/i })).toBeVisible()

  for (let step = 0; step < 5; step++) await page.getByRole('button', { name: /continuar/i }).click()
  const stations = page.locator('.checkitem')
  await expect(stations.first()).toBeVisible({ timeout: 15_000 })
  await stations.nth(0).click()
  await page.getByRole('button', { name: /esteira/i }).click()
  await page.getByRole('button', { name: /continuar/i }).click()
  await page.getByRole('button', { name: /criar meu programa/i }).click()
  await expect(page.getByRole('heading', { name: /^dashboard$/i })).toBeVisible()

  await page.goto('/body')
  await expect(page.getByRole('heading', { name: /^corpo$/i })).toBeVisible()
  await expect(page.getByText(/nenhuma medida registrada/i)).toBeVisible()

  await page.getByLabel(/^valor/i).fill('82.4')
  await page.getByLabel(/^dia/i).fill('2026-09-10')
  await page.getByRole('button', { name: /salvar/i }).click()

  await expect(page.locator('.loglist__row')).toHaveCount(1)
  await expect(page.locator('.loglist__row')).toContainText('82.4 kg')

  // Circunferência com lado: o campo de lado só aparece para ela.
  await page.getByLabel(/^medida/i).selectOption('coxa')
  await expect(page.getByLabel(/^lado/i)).toBeVisible()
  await page.getByLabel(/^lado/i).selectOption('D')
  await page.getByLabel(/^valor \(cm\)/i).fill('58')
  await page.getByRole('button', { name: /salvar/i }).click()

  // Esperar a linha aparecer antes de recarregar: o reload no meio da
  // gravação cancelaria a transação do IndexedDB, e o teste ficaria instável.
  await page.getByRole('button', { name: /^coxa/i }).click()
  await expect(page.locator('.loglist__row')).toContainText('58 cm')

  await page.reload()
  await expect(page.locator('.loglist__row')).toContainText('82.4 kg')
  await page.getByRole('button', { name: /^coxa/i }).click()
  await expect(page.locator('.loglist__row')).toContainText('58 cm')

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})
