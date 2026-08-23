import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, devLogin, fetchAuthConfig, loginUrl, type AuthConfig } from '../lib/api.js'
import { useAuth } from '../lib/auth.js'

/**
 * Duas colunas no desktop, como o frame de 1280 do mockup: o argumento à
 * esquerda com a manchete em Barlow Condensed, o cartão de entrada à direita.
 */
export function Login() {
  const { t } = useTranslation()
  const { reload } = useAuth()
  const [config, setConfig] = useState<AuthConfig | null>(null)

  useEffect(() => {
    void fetchAuthConfig().then(setConfig).catch(() => setConfig({ google: false, devLogin: false }))
  }, [])

  return (
    <main className="login">
      <section className="login__pitch">
        <span className="eyebrow">{t('app.name')}</span>

        <h1 className="login__headline">
          {t('app.tagline').split(',').map((line, index) => (
            <span key={index} style={{ display: 'block' }}>
              {line.trim()}{index === 0 ? ',' : ''}
            </span>
          ))}
        </h1>

        <div className="login__facts">
          <span>{t('login.fact_prep')}</span>
          <span>{t('login.fact_lift')}</span>
          <span>{t('login.fact_cardio')}</span>
        </div>
      </section>

      <section className="login__panel">
        <div className="login__card">
          <div className="stack stack--tight">
            <h2>{t('login.title')}</h2>
            <span className="muted" style={{ fontSize: '14px', lineHeight: 1.5 }}>
              {t('login.hint')}
            </span>
          </div>

          {config?.google && (
            <>
              <a className="login__google" href={loginUrl}>
                <span className="login__mark" aria-hidden="true" />
                <span>{t('login.google')}</span>
              </a>
              <div className="login__rule">
                <span>OAUTH 2.0</span>
              </div>
              <span className="mono dim">{t('login.scopes')}</span>
            </>
          )}

          {config?.devLogin && <DevLoginForm onDone={reload} />}

          {config && !config.google && !config.devLogin && (
            <p className="muted">{t('login.unavailable')}</p>
          )}

          <span className="login__fine">{t('login.disclaimer')}</span>
        </div>
      </section>
    </main>
  )
}

/**
 * Só aparece quando a API declara o login provisório ativo. É um bypass
 * temporário até o OAuth do Google existir — some sozinho quando
 * DEV_LOGIN_ENABLED voltar a false.
 */
function DevLoginForm({ onDone }: { onDone: () => Promise<void> }) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await devLogin(token, email)
      await onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'erro_interno')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="dev-login" onSubmit={submit}>
      <span className="dev-login__badge">{t('login.dev.badge')}</span>
      <label className="field">
        {t('login.dev.email')}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      </label>
      <label className="field">
        {t('login.dev.token')}
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" required />
      </label>
      <button className="button button--primary" type="submit" disabled={busy}>
        {busy ? t('login.loading') : t('login.dev.submit')}
      </button>
      {error && <span className="dev-login__error">{t(`errors.${error}`, t('errors.erro_interno'))}</span>}
    </form>
  )
}
