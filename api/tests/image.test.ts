import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { MAX_PIXELS, MAX_UPLOAD_BYTES, detectMime, processUpload } from '../src/lib/image.js'
import { HttpError } from '../src/lib/http-error.js'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])

describe('detectMime', () => {
  it('reconhece PNG, JPEG e WebP pelos bytes', () => {
    expect(detectMime(PNG)).toBe('image/png')
    expect(detectMime(JPEG)).toBe('image/jpeg')
    expect(detectMime(WEBP)).toBe('image/webp')
  })

  it('gera miniatura de até 640 px sem deformar a imagem', async () => {
    const source = await sharp({
      create: { width: 1000, height: 800, channels: 3, background: '#b23a26' },
    }).png().toBuffer()
    const result = await processUpload(source)
    const metadata = await sharp(result.thumb).metadata()

    expect(metadata.width).toBe(640)
    expect(metadata.height).toBe(512)
  })

  it('rejeita conteúdo que só se diz imagem no content-type', () => {
    const disfarcado = Buffer.from('<?php system($_GET["c"]); ?>')
    expect(() => detectMime(disfarcado)).toThrowError(HttpError)
  })
})

/**
 * O teto de bytes não protege a memória: quem aloca é o raster decodificado.
 * Um PNG de imagem uniforme comprime a quase nada e o padrão do sharp
 * (268 MP) deixaria passar o suficiente para derrubar o container.
 */
describe('bomba de descompressão', () => {
  it('recusa imagem que cabe no upload mas estoura a memória ao decodificar', async () => {
    const lado = 16_000
    const bomba = await sharp({
      create: { width: lado, height: lado, channels: 3, background: '#16150f' },
    }).png({ compressionLevel: 9 }).toBuffer()

    // Passa folgado no limite de bytes — é esse o ponto.
    expect(bomba.byteLength).toBeLessThan(MAX_UPLOAD_BYTES)
    expect(lado * lado).toBeGreaterThan(MAX_PIXELS)

    // 400 com código próprio, não 500 genérico: o usuário precisa saber por quê.
    await expect(processUpload(bomba)).rejects.toMatchObject({
      status: 400,
      code: 'imagem_grande_demais',
    })
  }, 60_000)

  it('foto de celular continua passando', async () => {
    const foto = await sharp({
      create: { width: 4032, height: 3024, channels: 3, background: '#b23a26' },
    }).jpeg().toBuffer()

    const result = await processUpload(foto)
    expect(result.width).toBe(4032)
    expect(result.height).toBe(3024)
  }, 60_000)
})
