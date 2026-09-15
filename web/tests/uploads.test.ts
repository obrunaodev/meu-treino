import { beforeEach, describe, expect, it, vi } from 'vitest'

// A rede é a única fronteira simulada: a fila e o IndexedDB são os reais.
const apiFetch = vi.fn()
// O fake-indexeddb devolve o Blob do Node, que o FormData do jsdom recusa. O
// corpo não importa aqui — a requisição é simulada logo acima.
vi.stubGlobal('FormData', class { append() {} })
vi.mock('../src/lib/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/api.js')>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}))

const { ApiError } = await import('../src/lib/api.js')
const { localDb } = await import('../src/lib/db.js')
const { flushUploads } = await import('../src/lib/uploads.js')

const EXERCISE = '00000000-0000-7000-8000-000000000011'

async function queue(id: string, queuedAt: string) {
  await localDb.uploads.put({ id, exerciseId: EXERCISE, blob: new Blob(['x']), filename: `${id}.png`, queuedAt })
}

beforeEach(async () => {
  apiFetch.mockReset()
  await localDb.delete()
  await localDb.open()
})

describe('flushUploads', () => {
  it('descarta o arquivo grande demais e segue para o próximo', async () => {
    await queue('grande', '2026-09-15T10:00:00.000Z')
    await queue('normal', '2026-09-15T10:01:00.000Z')
    apiFetch
      .mockRejectedValueOnce(new ApiError(413, 'arquivo_grande_demais'))
      .mockRejectedValueOnce(new ApiError(503, 'indisponivel'))

    await flushUploads()

    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect((await localDb.uploads.toArray()).map((upload) => upload.id)).toEqual(['normal'])
  })

  it('mantém na fila o que falhou por motivo passageiro', async () => {
    await queue('passageiro', '2026-09-15T10:00:00.000Z')
    apiFetch.mockRejectedValueOnce(new ApiError(500, 'erro_interno'))

    await flushUploads()

    expect(await localDb.uploads.count()).toBe(1)
  })
})
