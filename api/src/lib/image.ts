import sharp from 'sharp'
import { badRequest } from './http-error.js'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const THUMB_SIZE = 640

/**
 * Assinaturas de arquivo. O `content-type` do multipart vem do cliente e não
 * vale nada — quem decide o que é a imagem são os bytes.
 */
const SIGNATURES: Array<{ mime: string; bytes: number[]; offset: number }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], offset: 0 },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 },
  { mime: 'image/webp', bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
]

export function detectMime(buffer: Buffer): string {
  for (const sig of SIGNATURES) {
    const slice = buffer.subarray(sig.offset, sig.offset + sig.bytes.length)
    if (sig.bytes.every((b, i) => slice[i] === b)) return sig.mime
  }
  throw badRequest('formato_nao_suportado')
}

export async function processUpload(buffer: Buffer) {
  const mime = detectMime(buffer)
  const image = sharp(buffer, { failOn: 'error' })
  const meta = await image.metadata()

  if (!meta.width || !meta.height) throw badRequest('imagem_ilegivel')

  // Reencoda em WebP: as ilustrações do catálogo são PNG grandes, e a
  // biblioteca inteira precisa caber no cache offline do service worker.
  const full = await sharp(buffer).rotate().webp({ quality: 82 }).toBuffer()
  const thumb = await sharp(buffer)
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer()

  return { full, thumb, mime, width: meta.width, height: meta.height }
}
