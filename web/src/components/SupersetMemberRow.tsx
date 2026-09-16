import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../lib/api.js'
import type { CatalogExercise, Exercise, ExerciseMedia } from '../lib/types.js'
import { MediaImage } from './MediaImage.js'
import type { SessionChecklistItem } from './SessionExerciseChecklist.js'
import { Modal } from './ui.js'

/**
 * Um membro do bi-set na tira de cima: quem é, e o que dá para fazer com ele.
 *
 * As ações de um exercício só (aquecer, pular, ver imagem) precisam dizer de
 * qual exercício são — no grupo há dois ou três ao mesmo tempo.
 */
export function SupersetMemberRow({ letter, name, item, exercise, media, skipped, onWarmup, onSkip }: {
  letter: string
  name: string
  item: SessionChecklistItem
  exercise: Exercise | null
  media: ExerciseMedia | null
  skipped: boolean
  onWarmup: () => void
  onSkip: () => void
}) {
  const { t, i18n } = useTranslation()
  const [showImage, setShowImage] = useState(false)
  const [catalog, setCatalog] = useState<CatalogExercise | null>(null)

  useEffect(() => {
    if (!exercise?.catalogExerciseId) return
    let current = true
    void apiFetch<CatalogExercise>(`/api/catalog/exercises/${exercise.catalogExerciseId}`)
      .then((result) => { if (current) setCatalog(result) }).catch(() => { if (current) setCatalog(null) })
    return () => { current = false }
  }, [exercise?.catalogExerciseId])

  const lang = i18n.language.startsWith('pt') ? 'pt' : 'en'
  const videoUrl = catalog?.video?.[lang] ?? catalog?.video?.pt ?? catalog?.video?.en ?? null
  const description = catalog?.description?.[lang] ?? catalog?.description?.pt ?? catalog?.description?.en ?? null

  return <li className={`session-superset__member${skipped ? ' session-superset__member--skipped' : ''}`}>
    <span className="session-superset__letter mono">{letter}</span>
    <div className="session-superset__member-copy">
      <strong>{name}</strong>
      <small className="mono muted">
        {t('session.sets_count', { count: item.sets })}{skipped ? ` · ${t('session.skipped')}` : ''}
      </small>
      {(item.notes || (exercise?.cues.length ?? 0) > 0 || description) && <details className="session-focus__specifics">
        <summary>{t('session.execution_details')}</summary>
        {item.notes && <p>{item.notes}</p>}
        {exercise?.cues.map((cue, index) => <p key={index}>• {cue}</p>)}
        {description && <p>{description}</p>}
      </details>}
      <div className="session-superset__member-actions">
        {media && <button type="button" className="button button--quiet" onClick={() => setShowImage(true)}>
          {t('session.view_image_of', { name })}
        </button>}
        {videoUrl && <a className="button button--quiet" href={videoUrl} target="_blank" rel="noopener noreferrer">
          {t('session.watch_video')}
        </a>}
        {!skipped && <>
          <button type="button" className="button button--quiet" onClick={onWarmup}>{t('session.add_warmup')}</button>
          <button type="button" className="button button--ghost" onClick={onSkip}>{t('session.skip_member', { name })}</button>
        </>}
      </div>
    </div>
    {showImage && media && <Modal title={name} closeLabel={t('common.close')} onClose={() => setShowImage(false)} wide>
      <MediaImage className="media-lightbox__image" mediaId={media.id} variant="full" alt={name} />
    </Modal>}
  </li>
}
