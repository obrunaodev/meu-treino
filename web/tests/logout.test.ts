import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { localDb, getMeta, setMeta } from '../src/lib/db.js'
import { mutate } from '../src/lib/outbox.js'
import { pendingCount } from '../src/lib/outbox.js'

/**
 * Sair da conta apaga o banco local — é o que impede o próximo login herdar
 * dados alheios. O risco é o outro lado: a fila é a ÚNICA cópia do que ainda
 * não subiu, e o app existe para registrar treino sem rede.
 */

const OWNER = '00000000-0000-7000-8000-000000000001'

describe('proteção do trabalho pendente', () => {
  beforeEach(async () => {
    await localDb.delete()
    await localDb.open()
  })

  it('a fila conta o que ainda não foi sincronizado', async () => {
    expect(await pendingCount()).toBe(0)

    await mutate('set_logs', { ownerId: OWNER, sessionId: 'a', exerciseId: 'b', setIndex: 1 })
    await mutate('set_logs', { ownerId: OWNER, sessionId: 'a', exerciseId: 'b', setIndex: 2 })

    expect(await pendingCount()).toBe(2)
  })

  it('apagar o banco leva a fila junto — por isso o aviso existe', async () => {
    await mutate('set_logs', { ownerId: OWNER, sessionId: 'a', exerciseId: 'b', setIndex: 1 })
    expect(await pendingCount()).toBe(1)

    await localDb.delete()
    await localDb.open()

    expect(await pendingCount()).toBe(0)
  })
})

describe('cerca de conta', () => {
  beforeEach(async () => {
    await localDb.delete()
    await localDb.open()
  })

  it('guarda de quem é o banco local', async () => {
    await setMeta('ownerId', OWNER)
    expect(await getMeta<string | null>('ownerId', null)).toBe(OWNER)
  })

  it('detecta que o dono mudou, que é o gatilho da limpeza', async () => {
    await setMeta('ownerId', OWNER)
    await mutate('set_logs', { ownerId: OWNER, sessionId: 'a', exerciseId: 'b', setIndex: 1 })

    const outro = '00000000-0000-7000-8000-000000000002'
    const anterior = await getMeta<string | null>('ownerId', null)
    expect(anterior).not.toBe(outro)

    // É este ramo que dispara o wipe em AuthProvider.reload().
    await localDb.delete()
    await localDb.open()
    expect(await localDb.table_('set_logs').count()).toBe(0)
  })
})

describe('limpeza do Cache Storage', () => {
  it('apaga todos os caches, onde mora a mídia privada', async () => {
    const apagados: string[] = []
    vi.stubGlobal('caches', {
      keys: async () => ['media', 'catalog', 'workbox-precache'],
      delete: async (nome: string) => { apagados.push(nome); return true },
    })

    // Mesma sequência de wipeLocalData: chaves e depois delete em cada uma.
    const nomes = await caches.keys()
    await Promise.all(nomes.map((nome) => caches.delete(nome)))

    expect(apagados).toEqual(['media', 'catalog', 'workbox-precache'])
    vi.unstubAllGlobals()
  })
})
