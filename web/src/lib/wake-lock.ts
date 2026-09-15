import { useEffect } from 'react'

/**
 * Mantém a tela acesa enquanto `active`.
 *
 * O treino é operado com o celular na mão entre as séries: a tela apagar no
 * meio do descanso obriga a desbloquear só para ver o cronômetro. O navegador
 * solta o lock sozinho quando a página some (troca de app, bloqueio), então ele
 * é pedido de novo ao voltar a ficar visível. Sem suporte, ou recusado por
 * bateria baixa ou política, nada aparece — é conveniência, não requisito.
 */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let pending = false
    let disposed = false

    const acquire = async () => {
      if (sentinel || pending || document.visibilityState !== 'visible') return
      pending = true
      try {
        const lock = await navigator.wakeLock.request('screen')
        // Desmontou enquanto o pedido estava no ar: o lock chegou sem dono.
        if (disposed) return void lock.release()
        sentinel = lock
        lock.addEventListener('release', () => { if (sentinel === lock) sentinel = null })
      } catch {
        // Recusado agora; a próxima volta à visibilidade tenta de novo.
      } finally {
        pending = false
      }
    }
    const onVisibilityChange = () => void acquire()

    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void sentinel?.release()
      sentinel = null
    }
  }, [active])
}
