import { expect, test } from '@playwright/test'

const TOKEN = process.env.DEV_LOGIN_TOKEN ?? ''

test('reviews and creates a compatible preset program', async ({ page }) => {
  test.skip(!TOKEN, 'requires DEV_LOGIN_TOKEN and temporary login')
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(`preset-e2e-${Date.now()}@example.com`)
  await page.getByLabel(/token/i).fill(TOKEN)
  await page.getByRole('button', { name: /^entrar$/i }).click()

  await page.getByRole('button', { name: /usar um modelo/i }).click()
  await expect(page.getByText(/hipertrofia.*45 min/i)).toBeVisible()
  for (let step = 0; step < 5; step++) {
    await page.getByRole('button', { name: /continuar/i }).click()
  }

  await page.getByRole('button', { name: /marcar todos/i }).click()
  await page.getByRole('button', { name: /continuar/i }).click()
  await expect(page.getByRole('heading', { name: /revise seu plano/i })).toBeVisible()
  await expect(page.locator('.preset-review__workout')).toHaveCount(2)
  await expect(page.getByText(/sem aparelho compatível/i)).toHaveCount(0)

  await page.getByRole('button', { name: /continuar/i }).click()
  await page.getByRole('button', { name: /criar meu programa/i }).click()
  await expect(page.getByRole('heading', { name: /^dashboard$/i })).toBeVisible()
})
