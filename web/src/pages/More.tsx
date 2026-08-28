import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

/**
 * Portal mobile para recursos e sistema que não cabem entre os quatro destinos
 * centrais de treino da barra inferior.
 */
const GROUPS = [
  { key: 'resources', entries: [
    { to: '/biblioteca', key: 'library' },
    { to: '/equipamentos', key: 'academy' },
    { to: '/marcador', key: 'tests' },
    { to: '/dor', key: 'pain' },
  ] },
  { key: 'system', entries: [
    { to: '/configuracoes', key: 'settings' },
  ] },
]

export function More() {
  const { t } = useTranslation()

  return (
    <div className="page">
      <header className="page__title">
        <h1>{t('nav.more')}</h1>
        <p className="page__description">{t('pages.more')}</p>
      </header>
      <nav className="menu menu--grouped">
        {GROUPS.map((group) => <section key={group.key} className="menu__group">
          <span className="eyebrow">{t(`nav.groups.${group.key}`)}</span>
          {group.entries.map((entry) => (
            <Link key={entry.to} to={entry.to} className="menu__item">
              <span>{t(`nav.${entry.key}`)}</span>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </section>)}
      </nav>
    </div>
  )
}
