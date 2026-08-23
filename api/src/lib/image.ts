import sharp from 'sharp'
import { badRequest } from './http-error.js'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const THUMB_SIZE = 640

/**
 * Teto de pixels DECODIFICADOS, que é o que consome memória — o limite de
 * bytes não protege disso. PNG comprime imagem uniforme quase a nada: 16000 ×
 * 16000 cabe em 0,74 MB e vira ~0,95 GB de raster, contra um container de
 * 256 MB. O padrão do sharp (268 MP) deixa isso passar.
 *
 * 40 MP é folga larga para foto de celular: um iPhone de 48 MP em 4:3 dá 12 MP.
 */
export const MAX_PIXELS = 40_000_000

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
  // `metadata()` lê o cabeçalho e não decodifica, então pode abrir sem teto —
  // e é por isso que a recusa sai daqui com código próprio. Deixar o sharp
  // estourar sozinho daria 500 genérico, sem dizer o que houve.
  const meta = await sharp(buffer, { failOn: 'error', limitInputPixels: false }).metadata()

  if (!meta.width || !meta.height) throw badRequest('imagem_ilegivel')
  if (meta.width * meta.height > MAX_PIXELS) {
    throw badRequest('imagem_grande_demais', { width: meta.width, height: meta.height })
  }

  // O teto vale em TODA abertura do buffer, não só na primeira: cada
  // `sharp(...)` abaixo decodifica por conta própria. Redundante depois da
  // checagem acima, e é essa a intenção — se ela mudar, o limite continua.
  const options = { failOn: 'error' as const, limitInputPixels: MAX_PIXELS }

  // Reencoda em WebP: as ilustrações do catálogo são PNG grandes, e a
  // biblioteca inteira precisa caber no cache offline do service worker.
  const full = await sharp(buffer, options).rotate().webp({ quality: 82 }).toBuffer()
  const thumb = await sharp(buffer, options)
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer()

  return { full, thumb, mime, width: meta.width, height: meta.height }
}
