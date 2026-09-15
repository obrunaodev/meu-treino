import { expect, test } from '@playwright/test'

/**
 * Exercício criado pelo editor de treinos não tem descanso próprio, então o
 * que vale na sessão é o padrão do programa. A sessão ignorava esse padrão e
 * mostrava sempre 90 s, qualquer que fosse a escolha do onboarding.
 */

const TOKEN = process.env.DEV_LOGIN_TOKEN ?? ''

test('a sessão usa o descanso padrão do programa', async ({ page }) => {
  test.skip(!TOKEN, 'precisa de DEV_LOGIN_TOKEN e do login provisório ativo')

  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(`descanso-${Date.now()}@exemplo.com`)
  await page.getByLabel(/token/i).fill(TOKEN)
  await page.getByRole('button', { name: /^entrar$/i }).click()
  await expect(page.getByRole('heading', { name: /como você quer começar/i })).toBeVisible()

  await page.getByRole('button', { name: /continuar/i }).click()   // modelo
  await page.getByRole('button', { name: /continuar/i }).click()   // programa
  await page.getByRole('button', { name: /continuar/i }).click()   // ritmo
  await page.getByRole('button', { name: /continuar/i }).click()   // ciclo
  await page.getByLabel(/descanso padrão/i).fill('150')
  await page.getByRole('button', { name: /continuar/i }).click()   // bloco

  const stations = page.locator('.checkitem')
  await expect(stations.first()).toBeVisible({ timeout: 15_000 })
  await stations.nth(0).click()
  await stations.nth(1).click()
  await page.getByRole('button', { name: /esteira/i }).click()
  await page.getByRole('button', { name: /continuar/i }).click()   // lembretes
  await page.getByRole('button', { name: /criar meu programa/i }).click()
  await expect(page.getByRole('heading', { name: /^dashboard$/i })).toBeVisible()

  await page.getByRole('link', { name: /^exercícios$/i }).first().click()
  await page.getByRole('button', { name: /importar do catálogo/i }).click()
  await expect(page.locator('.checkitem').first()).toBeVisible({ timeout: 15_000 })
  await page.locator('.checkitem').first().click()
  await expect(page.locator('.tile')).toHaveCount(1)

  await page.getByRole('link', { name: /gerenciar treinos/i }).first().click()
  await page.getByRole('button', { name: /adicionar exercício/i }).click()
  await page.locator('.checkitem').first().click()
  await expect(page.locator('.item')).toHaveCount(1)

  await page.getByRole('link', { name: /treino de hoje/i }).first().click()
  await page.getByRole('button', { name: /iniciar treino a/i }).click()
  await page.locator('.session-exercise__overview').click()

  await expect(page.getByText('150s descanso').first()).toBeVisible()
})
