/**
 * Defaults do compose local para os testes que importam módulos da API (o
 * `env.ts` valida na importação e derruba a suíte se faltar alguma variável).
 * O que já está no ambiente vence, para o CI apontar para outro banco.
 */
const DEFAULTS: Record<string, string> = {
  DATABASE_URL: 'postgres://treino:change-me@localhost:5432/treino',
  SESSION_SECRET: 'dev-only-insecure-secret-change-in-prod',
  APP_ORIGIN: 'http://localhost:5173',
  GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'treino-media',
  S3_ACCESS_KEY: 'treino',
  S3_SECRET_KEY: 'change-me-too',
  NODE_ENV: 'test',
}

for (const [key, value] of Object.entries(DEFAULTS)) {
  process.env[key] ??= value
}
