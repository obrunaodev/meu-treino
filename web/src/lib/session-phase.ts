import { useCallback, useState } from 'react'
import type { SessionPhase } from './domain/session.js'

/**
 * Fase da sessão, persistida no dispositivo.
 *
 * É estado de UI local, não dado do usuário: não sincroniza e não vale um
 * registro no servidor. Mas precisa sobreviver a recarregar a página — o
 * usuário troca para o app de música, volta, e não pode cair de novo no
 * cronômetro de preparação no meio do treino.
 *
 * localStorage e não IndexedDB de propósito: a leitura é síncrona, então a
 * primeira renderização já sai na fase certa, sem piscar a tela errada.
 */

interface StoredPhase {
  phase: SessionPhase
  phaseStartedAt: string
}

const key = (sessionId: string) => `treino:fase:${sessionId}`

function read(sessionId: string): StoredPhase | null {
  try {
    const raw = localStorage.getItem(key(sessionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredPhase
    return parsed.phase && parsed.phaseStartedAt ? parsed : null
  } catch {
    return null
  }
}

export function useSessionPhase(sessionId: string | undefined, hasLoggedSets: boolean) {
  const [state, setState] = useState<StoredPhase>(() => {
    const stored = sessionId ? read(sessionId) : null
    if (stored) return stored
    // Sem registro guardado, a presença de séries já diz que a preparação
    // acabou — vale para uma sessão que começou em outro dispositivo.
    return {
      phase: hasLoggedSets ? 'exercicios' : 'preparacao',
      phaseStartedAt: new Date().toISOString(),
    }
  })

  const update = useCallback((phase: SessionPhase, startedAt = new Date().toISOString()) => {
    const next = { phase, phaseStartedAt: startedAt }
    setState(next)
    if (sessionId) {
      try {
        localStorage.setItem(key(sessionId), JSON.stringify(next))
      } catch {
        // Modo privado com storage cheio: a sessão segue, só não sobrevive ao reload.
      }
    }
  }, [sessionId])

  return [state, update] as const
}

/** Sessão encerrada não precisa mais da fase ocupando espaço. */
export function clearSessionPhase(sessionId: string) {
  try {
    localStorage.removeItem(key(sessionId))
  } catch {
    // Sem storage não há o que limpar.
  }
}
