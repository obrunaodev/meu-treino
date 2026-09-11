import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { fetchMediaBlob } from '../lib/api.js'

interface MediaImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  mediaId: string
  variant?: 'full' | 'thumb'
  /** Obrigatório: `''` para imagem decorativa que já tem rótulo ao lado. */
  alt: string
}

/** Exibe mídia privada sem expor o token na URL. */
export function MediaImage({ mediaId, variant = 'full', className, alt, ...props }: MediaImageProps) {
  const [source, setSource] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | null = null
    void fetchMediaBlob(mediaId, variant, controller.signal).then((blob) => {
      objectUrl = URL.createObjectURL(blob)
      setSource(objectUrl)
    }).catch(() => undefined)
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [mediaId, variant])

  if (!source) return <span className={`${className ?? ''} media-image--loading`.trim()} aria-hidden="true" />
  return <img {...props} className={className} src={source} alt={alt} />
}
