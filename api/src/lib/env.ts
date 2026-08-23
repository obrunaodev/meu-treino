import { z } from 'zod'

/** Comprimento mínimo do token do login provisório. Ver DEV_LOGIN_TOKEN abaixo. */
const DEV_LOGIN_TOKEN_MIN = 32
const DEV_WHATSAPP_TOKEN = 'dev-whatsapp-internal-token-change-me-123456'

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().url(),
    SESSION_SECRET: z.string().min(16),
    APP_ORIGIN: z.string().url(),

    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
    GOOGLE_REDIRECT_URI: z.string().url(),

    /**
     * Login provisório enquanto o OAuth do Google não está configurado.
     *
     * É um bypass de autenticação: quem tiver o token vira qualquer usuário.
     * Fica desligado por padrão e, quando ligado, exige um token longo — sem
     * isso a URL sozinha bastaria para entrar.
     */
    DEV_LOGIN_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    DEV_LOGIN_TOKEN: z.string().default(''),

    S3_ENDPOINT: z.string().url(),
    S3_BUCKET: z.string().min(1),
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),

    VAPID_PUBLIC_KEY: z.string().default(''),
    VAPID_PRIVATE_KEY: z.string().default(''),
    VAPID_SUBJECT: z.string().default('mailto:admin@localhost'),
    /**
     * Fuso do install, não do usuário: o app é de uso pessoal e uma coluna por
     * usuário seria máquina para um caso que não existe. É daqui que sai o dia
     * da semana e a hora local do lembrete — em UTC eles saem errados.
     */
    REMINDER_TIMEZONE: z.string().default('America/Sao_Paulo'),

    WHATSAPP_BOT_URL: z.string().url().default('http://whatsapp-bot:3100'),
    WHATSAPP_INTERNAL_TOKEN: z.string().min(32).default(DEV_WHATSAPP_TOKEN),
  })
  // Ligar o bypass com token fraco é o erro que apaga o propósito do token.
  // Melhor a API não subir do que subir com a porta encostada.
  .refine((e) => !e.DEV_LOGIN_ENABLED || e.DEV_LOGIN_TOKEN.length >= DEV_LOGIN_TOKEN_MIN, {
    path: ['DEV_LOGIN_TOKEN'],
    message: `com DEV_LOGIN_ENABLED=true, precisa de ao menos ${DEV_LOGIN_TOKEN_MIN} caracteres (openssl rand -base64 32)`,
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.WHATSAPP_INTERNAL_TOKEN !== DEV_WHATSAPP_TOKEN, {
    path: ['WHATSAPP_INTERNAL_TOKEN'],
    message: 'troque o segredo interno padrão em produção',
  })

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
  throw new Error(`Configuração inválida:\n${issues.join('\n')}`)
}

export const env = parsed.data
export const isProd = env.NODE_ENV === 'production'
export const hasGoogleOAuth = env.GOOGLE_CLIENT_ID !== '' && env.GOOGLE_CLIENT_SECRET !== ''
