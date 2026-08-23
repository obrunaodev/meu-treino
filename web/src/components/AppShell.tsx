import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/auth.js'
import { SyncBar } from './SyncBar.js'

/**
 * Desktop: coluna de 232px com a navegação inteira e a identidade do usuário
 * ancorada no rodapé da barra. Mobile: cabeçalho enxuto e quatro abas embaixo,
 * conforme o sistema responsivo. Mesma árvore, só CSS decide — manter duas
 * navegações em sincronia é como elas divergem.
 */
const LINKS = [
  { to: '/', key: 'dashboard', end: true },
  { to: '/sessao', key: 'session' },
  { to: '/treinos', key: 'templates' },
  { to: '/biblioteca', key: 'library' },
  { to: '/dor', key: 'pain' },
  { to: '/marcador', key: 'tests' },
  { to: '/historico', key: 'history' },
  { to: '/whatsapp', key: 'whatsapp' },
  { to: '/configuracoes', key: 'settings' },
]

/**
 * Quatro abas no mobile, com rótulos curtos para o viewport de 420px.
 * O que não cabe vai para /mais — oito abas numa barra de 420px viram texto
 * quebrado em duas linhas e alvo de toque pequeno demais.
 */
const TABS = [
  { to: '/sessao', key: 'today' },
  { to: '/', key: 'progress', end: true },
  { to: '/treinos', key: 'workouts' },
  { to: '/mais', key: 'more' },
]

export function AppShell() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const initial = user?.name?.trim().charAt(0).toUpperCase() ?? '·'

  return (
    <div className="shell">
      <SyncBar />

      <header className="shell__top">
        <span className="shell__brand">{t('app.name')}</span>
        {user?.pictureUrl
          ? <img className="shell__avatar" src={user.pictureUrl} alt="" width={28} height={28} />
          : <span className="shell__avatar">{initial}</span>}
      </header>

      <div className="shell__body">
        <nav className="shell__side" aria-label={t('app.name')}>
          <span className="shell__brand">{t('app.name')}</span>

          <div className="shell__nav">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className="shell__link">
                {t(`nav.${link.key}`)}
              </NavLink>
            ))}
          </div>

          <div className="shell__foot">
            <div className="shell__user">
              {user?.pictureUrl
                ? <img className="shell__avatar" src={user.pictureUrl} alt="" width={28} height={28} />
                : <span className="shell__avatar">{initial}</span>}
              <span className="shell__id">
                <span className="shell__name">{user?.name}</span>
                <span className="shell__mail">{user?.email}</span>
              </span>
            </div>
            <button type="button" className="shell__signout" onClick={() => void logout()}>
              {t('logout')}
            </button>
          </div>
        </nav>

        <main className="shell__main">
          <Outlet />
        </main>
      </div>

      <nav className="shell__tabs" aria-label={t('app.name')}>
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="shell__tab">
            {t(`nav.${tab.key}`)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
