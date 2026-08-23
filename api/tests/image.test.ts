import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { detectMime, processUpload } from '../src/lib/image.js'
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
