import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/auth.js'
import { routes } from '../lib/routes.js'

/**
 * O Google redireciona para a API, que grava o cookie de refresh e devolve o
 * browser para cá. Só falta trocar o cookie por um access token.
 */
export function AuthCallback() {
  const { reload } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  useEffect(() => {
    void reload().then(() => navigate(routes.dashboard, { replace: true }))
  }, [reload, navigate])

  return <main className="centered">{t('login.loading')}</main>
}
