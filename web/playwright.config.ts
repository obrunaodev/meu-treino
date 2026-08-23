import { defineConfig, devices } from '@playwright/test'

/**
 * Roda contra o stack do compose já no ar — não sobe servidor próprio. O fluxo
 * de sessão e o offline dependem de API, Postgres e MinIO reais; um mock aqui
 * testaria o mock.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    // O i18n escolhe pelo navigator.language; sem fixar, a suíte roda em
    // inglês e os seletores por texto em português não encontram nada.
    locale: 'pt-BR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
