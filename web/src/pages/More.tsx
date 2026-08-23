import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

/**
 * Só existe no mobile. O sistema resolve a navegação de 8 destinos em quatro
 * abas — Hoje, Progresso, Treinos e Mais — e joga o resto para cá. No desktop
 * a barra lateral cabe inteira e esta rota nunca aparece.
 */
const SECONDARY = [
  { to: '/biblioteca', key: 'library' },
  { to: '/dor', key: 'pain' },
  { to: '/marcador', key: 'tests' },
  { to: '/historico', key: 'history' },
  { to: '/whatsapp', key: 'whatsapp' },
  { to: '/configuracoes', key: 'settings' },
]

export function More() {
  const { t } = useTranslation()

  return (
    <div className="page">
      <h1>{t('nav.more')}</h1>
      <nav className="menu">
        {SECONDARY.map((entry) => (
          <Link key={entry.to} to={entry.to} className="menu__item">
            <span>{t(`nav.${entry.key}`)}</span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
