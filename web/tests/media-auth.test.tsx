import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaImage } from '../src/components/MediaImage.js'
import { fetchMediaBlob, setAccessToken } from '../src/lib/api.js'

describe('mídia privada', () => {
  afterEach(() => {
    setAccessToken(null)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('envia o token Bearer ao buscar uma miniatura', async () => {
    const blob = new Blob(['imagem'], { type: 'image/webp' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, blob: () => Promise.resolve(blob),
    })
    vi.stubGlobal('fetch', fetchMock)
    setAccessToken('token-da-sessao')

    await expect(fetchMediaBlob('media-1', 'thumb')).resolves.toBe(blob)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/media/media-1?variant=thumb',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ authorization: 'Bearer token-da-sessao' }),
      }),
    )
  })

  it('transforma a resposta autenticada em uma imagem renderizável', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, blob: () => Promise.resolve(new Blob(['imagem'])),
    }))
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:miniatura') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    setAccessToken('token-da-sessao')

    const view = render(<MediaImage mediaId="media-1" variant="thumb" alt="Exercício" />)
    await waitFor(() => expect(view.container.querySelector('img')).toHaveAttribute('src', 'blob:miniatura'))
  })
})
