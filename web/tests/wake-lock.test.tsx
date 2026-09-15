import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScreenWakeLock } from '../src/lib/wake-lock.js'

/** O Wake Lock é API do navegador — a fronteira que este teste simula. */
class FakeSentinel extends EventTarget {
  released = false
  async release() {
    if (this.released) return
    this.released = true
    this.dispatchEvent(new Event('release'))
  }
}

let granted: FakeSentinel[] = []
let request: ReturnType<typeof vi.fn>

function installWakeLock(impl?: () => Promise<FakeSentinel>) {
  request = vi.fn(impl ?? (async () => {
    const sentinel = new FakeSentinel()
    granted.push(sentinel)
    return sentinel
  }))
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

const flush = () => act(async () => {})

beforeEach(() => {
  granted = []
  setVisibility('visible')
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock')
})

describe('useScreenWakeLock', () => {
  it('pede o lock de tela uma vez quando ativo e visível', async () => {
    installWakeLock()
    renderHook(() => useScreenWakeLock(true))
    await flush()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('screen')
  })

  it('não pede quando inativo e solta quando a sessão deixa de estar aberta', async () => {
    installWakeLock()
    const { rerender } = renderHook(({ active }) => useScreenWakeLock(active), { initialProps: { active: false } })
    await flush()
    expect(request).not.toHaveBeenCalled()

    rerender({ active: true })
    await flush()
    rerender({ active: false })
    await flush()

    expect(granted[0]?.released).toBe(true)
  })

  it('solta ao desmontar', async () => {
    installWakeLock()
    const { unmount } = renderHook(() => useScreenWakeLock(true))
    await flush()
    unmount()

    expect(granted[0]?.released).toBe(true)
  })

  it('depois que o navegador solta, pede de novo só ao voltar a ficar visível', async () => {
    installWakeLock()
    renderHook(() => useScreenWakeLock(true))
    await flush()

    await act(async () => {
      setVisibility('hidden')
      await granted[0]!.release()
    })
    expect(request).toHaveBeenCalledTimes(1)

    await act(async () => setVisibility('visible'))
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('não quebra onde o navegador não tem Wake Lock', async () => {
    Reflect.deleteProperty(navigator, 'wakeLock')
    expect(() => renderHook(() => useScreenWakeLock(true))).not.toThrow()
    await flush()
  })

  it('pedido recusado não estoura e é repetido na próxima volta à visibilidade', async () => {
    let calls = 0
    installWakeLock(async () => {
      calls += 1
      if (calls === 1) throw new DOMException('battery', 'NotAllowedError')
      const sentinel = new FakeSentinel()
      granted.push(sentinel)
      return sentinel
    })
    renderHook(() => useScreenWakeLock(true))
    await flush()
    expect(granted).toHaveLength(0)

    await act(async () => setVisibility('visible'))
    expect(granted).toHaveLength(1)
  })

  it('lock que chega depois de desmontar é solto na hora', async () => {
    let grant: (sentinel: FakeSentinel) => void = () => {}
    installWakeLock(() => new Promise((resolve) => { grant = resolve }))
    const { unmount } = renderHook(() => useScreenWakeLock(true))
    unmount()

    const late = new FakeSentinel()
    await act(async () => grant(late))
    expect(late.released).toBe(true)
  })

  it('eventos de visibilidade em rajada não duplicam o pedido', async () => {
    let grant: (sentinel: FakeSentinel) => void = () => {}
    installWakeLock(() => new Promise((resolve) => { grant = resolve }))
    renderHook(() => useScreenWakeLock(true))
    setVisibility('visible')
    setVisibility('visible')

    expect(request).toHaveBeenCalledTimes(1)
    await act(async () => grant(new FakeSentinel()))
  })
})
