import { expect, test } from '@playwright/test'

/**
 * Bi-set de ponta a ponta: montar o grupo no editor e executá-lo na sessão.
 * O que essa jornada protege é a alternância — dois exercícios viram uma lista
 * de rodadas, e finalizar o bloco grava os dois de uma vez.
 */

const TOKEN = process.env.DEV_LOGIN_TOKEN ?? ''

test('monta um bi-set no treino e executa as rodadas alternadas', async ({ page }) => {
  test.skip(!TOKEN, 'precisa de DEV_LOGIN_TOKEN e do login provisório ativo')

  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(`biset-${Date.now()}@exemplo.com`)
  await page.getByLabel(/token/i).fill(TOKEN)
  await page.getByRole('button', { name: /^entrar$/i }).click()
  await expect(page.getByRole('heading', { name: /como você quer começar/i })).toBeVisible()

  await page.getByRole('button', { name: /continuar/i }).click()   // modelo
  await page.getByRole('button', { name: /continuar/i }).click()   // programa
  await page.getByRole('button', { name: /continuar/i }).click()   // ritmo
  await page.getByRole('button', { name: /continuar/i }).click()   // ciclo
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
  await page.locator('.checkitem').nth(0).click()
  await page.getByRole('button', { name: /importar do catálogo/i }).click()
  await page.locator('.checkitem').nth(0).click()
  await expect(page.locator('.tile')).toHaveCount(2)

  await page.getByRole('link', { name: /gerenciar treinos/i }).first().click()
  for (const _ of [0, 1]) {
    await page.getByRole('button', { name: /adicionar exercício/i }).click()
    await page.locator('.checkitem').first().click()
  }
  await expect(page.locator('.item')).toHaveCount(2)

  const names = await page.locator('.item__name strong').allTextContents()
  await page.locator('.item__name').first().click()
  await page.getByRole('button', { name: 'Unir ao próximo' }).click()
  await expect(page.locator('.item-block')).toHaveCount(1)
  await expect(page.getByText('Bi-set')).toBeVisible()

  await page.getByRole('link', { name: /treino de hoje/i }).first().click()
  await page.getByRole('button', { name: /iniciar treino a/i }).click()
  // Na visão geral o bloco já aparece junto; abrir um membro abre os dois.
  await expect(page.locator('.session-checklist__block')).toHaveCount(1)
  await page.locator('.session-exercise__overview').first().click()

  const checks = page.getByRole('button', { name: /^Marcar série/ })
  await expect(checks).toHaveCount(6)
  await expect(checks.nth(0)).toHaveAttribute('aria-label', `Marcar série 1 de ${names[0]} como concluída`)
  await expect(checks.nth(1)).toHaveAttribute('aria-label', `Marcar série 1 de ${names[1]} como concluída`)
  await expect(page.getByRole('button', { name: /Iniciar intervalo após a rodada/ })).toHaveCount(2)

  // Marcar troca o rótulo para "Desmarcar", então a série marcada sai da lista.
  for (let remaining = 6; remaining > 0; remaining--) await checks.first().click()
  await page.getByRole('button', { name: 'Finalizar bloco' }).click()

  // Os dois membros fecham juntos: a visão geral volta sem nenhum pendente.
  await expect(page.getByRole('heading', { name: /concluíd/i })).toBeVisible()
  await expect(page.locator('.session-exercise--done')).toHaveCount(2)
})
