import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import i18n from './lib/i18n.js'
import { AuthProvider, useAuth } from './lib/auth.js'
import { useActiveProgram, useSettings } from './lib/repo.js'
import { useBootstrapped } from './lib/sync.js'
import { SyncProvider } from './lib/sync-context.js'
import { AppShell } from './components/AppShell.js'
import { Login } from './pages/Login.js'
import { AuthCallback } from './pages/AuthCallback.js'
import { Onboarding } from './pages/Onboarding.js'
import { Dashboard } from './pages/Dashboard.js'
import { Session } from './pages/Session.js'
import { Templates } from './pages/Templates.js'
import { Library } from './pages/Library.js'
import { Equipment } from './pages/Equipment.js'
import { Pain } from './pages/Pain.js'
import { Tests } from './pages/Tests.js'
import { History } from './pages/History.js'
import { Settings } from './pages/Settings.js'
import { Conflicts } from './pages/Conflicts.js'
import { More } from './pages/More.js'
import { SessionDetail } from './pages/SessionDetail.js'
import { SessionGate } from './pages/SessionGate.js'
import { WhatsApp } from './pages/WhatsApp.js'

/**
 * Preferências salvas aplicadas ao documento: tema na raiz, idioma no i18n.
 *
 * O idioma precisa disto porque o i18n sobe antes de existir IndexedDB — sem
 * reaplicar aqui, trocar para inglês em Configurações duraria até o F5.
 */
function PreferencesSync() {
  const settings = useSettings()

  useEffect(() => {
    if (settings?.theme) document.documentElement.dataset.theme = settings.theme
  }, [settings?.theme])

  useEffect(() => {
    if (settings?.locale && settings.locale !== i18n.language) {
      void i18n.changeLanguage(settings.locale)
    }
  }, [settings?.locale])

  return null
}

function Authed() {
  const program = useActiveProgram()
  const bootstrapped = useBootstrapped()

  // Antes do primeiro sync, "sem programa" pode ser só "ainda não baixou".
  // Mandar para o onboarding aqui criaria um programa duplicado.
  const needsOnboarding = bootstrapped === true && !program

  if (bootstrapped === undefined || (!program && !needsOnboarding)) {
    return <main className="centered">…</main>
  }

  return (
    <>
      <PreferencesSync />
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/auth/callback" element={<Navigate to="/" replace />} />

        <Route element={<AppShell />}>
          {/* Sem programa não há ciclo, e sem ciclo nenhuma tela tem o que mostrar. */}
          <Route path="/" element={program ? <Dashboard /> : <Navigate to="/onboarding" replace />} />
          <Route path="/sessao" element={<SessionGate />} />
          <Route path="/sessao/:sessionId" element={<Session />} />
          <Route path="/treinos" element={<Templates />} />
          <Route path="/biblioteca" element={<Library />} />
          <Route path="/equipamentos" element={<Equipment />} />
          <Route path="/dor" element={<Pain />} />
          <Route path="/marcador" element={<Tests />} />
          <Route path="/historico" element={<History />} />
          <Route path="/historico/:sessionId" element={<SessionDetail />} />
          <Route path="/configuracoes" element={<Settings />} />
          <Route path="/conflitos" element={<Conflicts />} />
          <Route path="/whatsapp" element={<WhatsApp />} />
          <Route path="/mais" element={<More />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  )
}

function Routed() {
  const { status } = useAuth()
  if (status === 'carregando') return <main className="centered">…</main>

  if (status === 'anonimo') {
    return (
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<Login />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  return (
    <SyncProvider>
      <Authed />
    </SyncProvider>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routed />
      </AuthProvider>
    </BrowserRouter>
  )
}
