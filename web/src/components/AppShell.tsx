import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/auth.js'
import { SyncBar } from './SyncBar.js'
import { routes } from '../lib/routes.js'

/**
 * Desktop: navegação completa agrupada e identidade no rodapé. Mobile: quatro
 * destinos de treino e a porta “Mais” para recursos secundários.
 */
const GROUPS = [
  { key: 'training', links: [
    { to: routes.dashboard, key: 'dashboard', end: true },
    { to: routes.session, key: 'session' },
    { to: routes.history, key: 'history' },
    { to: routes.workouts, key: 'templates' },
  ] },
  { key: 'resources', links: [
    { to: routes.exercises, key: 'library' },
    { to: routes.equipment, key: 'academy' },
    { to: routes.functionalTests, key: 'tests' },
    { to: routes.pain, key: 'pain' },
  ] },
  { key: 'system', links: [
    { to: routes.settings, key: 'settings' },
  ] },
]

/**
 * Os quatro destinos centrais ficam fixos; “Mais” concentra recursos e sistema.
 */
const TABS = [
  { to: routes.dashboard, key: 'dashboard_short', end: true },
  { to: routes.session, key: 'today' },
  { to: routes.workouts, key: 'workouts' },
  { to: routes.history, key: 'history_short' },
  { to: routes.more, key: 'more' },
]

export function AppShell() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const initial = user?.name?.trim().charAt(0).toUpperCase() ?? '·'

  /**
   * Sair apaga o banco local. Se ainda há coisa na fila, ela é a única cópia
   * do treino que o servidor não viu — perguntar antes é o mínimo.
   */
  async function sairDaConta() {
    const resultado = await logout()
    if (resultado.ok) return
    if (window.confirm(t('logout_pendente', { count: resultado.pendente }))) {
      await logout(true)
    }
  }

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
            {GROUPS.map((group) => (
              <section key={group.key} className="shell__nav-group">
                <span className="shell__nav-label">{t(`nav.groups.${group.key}`)}</span>
                {group.links.map((link) => (
                  <NavLink key={link.to} to={link.to} end={link.to === routes.dashboard} className="shell__link">
                    {t(`nav.${link.key}`)}
                  </NavLink>
                ))}
              </section>
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
            <button type="button" className="shell__signout" onClick={() => void sairDaConta()}>
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
          <NavLink key={tab.to} to={tab.to} end={tab.to === routes.dashboard} className="shell__tab">
            {t(`nav.${tab.key}`)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
