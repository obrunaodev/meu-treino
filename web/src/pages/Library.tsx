import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../lib/api.js'
import {
  useAllTemplateItems, useEquipment, useExercises, useMedia, useSetLogs, useTemplatesEver,
} from '../lib/repo.js'
import { useActions } from '../lib/actions.js'
import { flushUploads, usePendingUploads } from '../lib/uploads.js'
import { runSync } from '../lib/sync.js'
import { Card, Empty, Modal, Select } from '../components/ui.js'
import { MediaImage } from '../components/MediaImage.js'
import type { CatalogExercise, Exercise } from '../lib/types.js'

export function Library() {
  const { t } = useTranslation()
  const exercises = useExercises()
  const equipment = useEquipment()
  const media = useMedia()
  const pending = usePendingUploads()
  const [detailId, setDetailId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [imageFilter, setImageFilter] = useState<'all' | 'with' | 'without'>('all')
  const [view, setView] = useState<'grid' | 'list'>(() =>
    localStorage.getItem('library-view') === 'list' ? 'list' : 'grid',
  )

  const illustrated = useMemo(
    () => new Set(media.map((m) => m.exerciseId)),
    [media],
  )
  const visibleExercises = useMemo(() => exercises.filter((exercise) => {
    if (imageFilter === 'all') return true
    return illustrated.has(exercise.id) === (imageFilter === 'with')
  }), [exercises, illustrated, imageFilter])

  const detail = exercises.find((e) => e.id === detailId) ?? null
  if (detail) return <ExerciseDetail exercise={detail} onBack={() => setDetailId(null)} />

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__title">
          <h1>{t('library.title')}</h1>
          <p className="page__description">{t('pages.library')}</p>
        </div>
        <button type="button" className="button button--primary" onClick={() => setImporting(true)}>
          {t('library.from_catalog')}
        </button>
      </div>

      <div className="library__toolbar">
        <span className="mono muted">
          {t('library.illustrated', { done: illustrated.size, total: exercises.length })}
          {pending.length > 0 && ` · ${t('library.queued', { count: pending.length })}`}
        </span>
        <div className="library__controls">
          <div className="view-switch" role="group" aria-label={t('library.image_filter')}>
            {(['all', 'with', 'without'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={imageFilter === option}
                onClick={() => setImageFilter(option)}
              >
                {t(`library.image_${option}`)}
              </button>
            ))}
          </div>
          <div className="view-switch" role="group" aria-label={t('library.view')}>
            {(['grid', 'list'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => {
                  setView(option)
                  localStorage.setItem('library-view', option)
                }}
              >
                {t(`library.${option}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {importing && <CatalogImport onClose={() => setImporting(false)} />}

      {exercises.length === 0 ? (
        <Empty message={t('library.empty')} />
      ) : visibleExercises.length === 0 ? (
        <Empty message={t('library.filter_empty')} />
      ) : (
        <div className={`exercise-gallery exercise-gallery--${view}`}>
          {visibleExercises.map((exercise) => {
            const thumb = media.find((m) => m.exerciseId === exercise.id)
            const machine = equipment.find((item) => item.id === exercise.equipmentId)
            return (
              <button
                key={exercise.id}
                type="button"
                className="tile"
                onClick={() => setDetailId(exercise.id)}
              >
                {thumb ? (
                  <MediaImage mediaId={thumb.id} variant="full" alt="" loading="lazy" />
                ) : (
                  <span className="tile__blank" aria-hidden="true" />
                )}
                <span className="tile__copy">
                  <span className="tile__name">{exercise.name}</span>
                  <span className="tile__meta">{machine?.name ?? t('library.no_equipment')}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Importa do catálogo global. O exercício vira uma cópia do usuário — o
 * catálogo é só-leitura, e a partir daqui ele edita o que quiser sem afetar
 * ninguém.
 */
function CatalogImport({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogExercise[]>([])
  const [busy, setBusy] = useState(false)
  const equipment = useEquipment()
  const { saveExercise } = useActions()

  useEffect(() => {
    const handle = setTimeout(() => {
      setBusy(true)
      void apiFetch<{ exercises: CatalogExercise[] }>(
        `/api/catalog/exercises?limit=40${query ? `&q=${encodeURIComponent(query)}` : ''}`,
      )
        .then((body) => setResults(body.exercises))
        .catch(() => setResults([]))
        .finally(() => setBusy(false))
    }, 250)
    return () => clearTimeout(handle)
  }, [query])

  async function importOne(catalog: CatalogExercise) {
    const match = equipment.find((e) => e.catalogStationCode === catalog.stationCode)
    const name = i18n.language.startsWith('pt')
      ? catalog.name
      : catalog.nameI18n.en ?? catalog.name

    await saveExercise({
      catalogExerciseId: catalog.id,
      equipmentId: match?.id ?? null,
      name,
      laterality: catalog.laterality ?? 'bilateral',
      unilateralAsymmetric: false,
      // O catálogo não distingue máquina articulada de aparelho de pino, então
      // não dá para inferir: quem marca é o usuário, olhando a máquina.
      loadPerSide: false,
      cues: [],
    })
    onClose()
  }

  return (
    <Card title={t('library.search_catalog')} action={
      <button type="button" className="button button--ghost" onClick={onClose}>{t('common.close')}</button>
    }>
      <label className="field">
        {t('common.search')}
        <input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </label>

      {busy && <span className="mono muted">{t('common.loading')}</span>}

      <div className="checklist">
        {results.map((catalog) => (
          <button key={catalog.id} type="button" className="checkitem" onClick={() => void importOne(catalog)}>
            <span>{catalog.name}</span>
            <span className="mono muted">{catalog.id}</span>
          </button>
        ))}
      </div>
    </Card>
  )
}

function ExerciseDetail({ exercise, onBack }: { exercise: Exercise; onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const equipment = useEquipment()
  const media = useMedia().find((m) => m.exerciseId === exercise.id) ?? null
  const { saveExercise, queueUpload, removeExerciseMedia } = useActions()
  const fileInput = useRef<HTMLInputElement>(null)
  const [catalog, setCatalog] = useState<CatalogExercise | null>(null)
  const [cue, setCue] = useState('')
  const [expandedMediaId, setExpandedMediaId] = useState<string | null>(null)

  useEffect(() => {
    if (!exercise.catalogExerciseId) return
    void apiFetch<CatalogExercise>(`/api/catalog/exercises/${exercise.catalogExerciseId}`)
      .then(setCatalog)
      .catch(() => setCatalog(null))
  }, [exercise.catalogExerciseId])

  async function receive(files: FileList | null) {
    const file = files?.item(files.length - 1)
    if (!file) return
    await queueUpload(exercise.id, file, file.name)
    await runSync().catch(() => undefined)
    await flushUploads()
  }

  const lang = i18n.language.startsWith('pt') ? 'pt' : 'en'
  const video = catalog?.video?.[lang] ?? catalog?.video?.pt

  return (
    <div className="stack">
      <button type="button" className="button button--ghost" onClick={onBack}>← {t('common.back')}</button>

      <Card title={t('library.detail')}>
        <label className="field">
          {t('library.name')}
          <input
            value={exercise.name}
            onChange={(e) => void saveExercise({ id: exercise.id, name: e.target.value })}
          />
        </label>

        <Select
          label={t('library.equipment')}
          value={exercise.equipmentId ?? ''}
          onChange={(value) => void saveExercise({ id: exercise.id, equipmentId: value || null })}
        >
          <option value="">{t('library.no_equipment')}</option>
          {equipment.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </Select>

        <Select
          label={t('library.laterality')}
          value={exercise.laterality}
          onChange={(value) => void saveExercise({ id: exercise.id, laterality: value })}
        >
          <option value="bilateral">{t('library.bilateral')}</option>
          <option value="unilateral">{t('library.unilateral')}</option>
        </Select>

        <label className="field field--inline">
          <input
            type="checkbox"
            // Exercício salvo antes da coluna existir não tem o campo no
            // IndexedDB, e `undefined` aqui torna o checkbox descontrolado.
            checked={exercise.loadPerSide ?? false}
            onChange={(e) => void saveExercise({ id: exercise.id, loadPerSide: e.target.checked })}
          />
          <span>
            {t('library.per_side')}
            <br />
            <span className="mono muted">{t('library.per_side_hint')}</span>
          </span>
        </label>

        {exercise.laterality === 'unilateral' && (
          <label className="field field--inline">
            <input
              type="checkbox"
              checked={exercise.unilateralAsymmetric}
              onChange={(e) => void saveExercise({ id: exercise.id, unilateralAsymmetric: e.target.checked })}
            />
            <span>
              {t('library.asymmetric')}
              <br />
              <span className="mono muted">{t('library.asymmetric_hint')}</span>
            </span>
          </label>
        )}

        {video && (
          <a className="button button--quiet" href={video} target="_blank" rel="noreferrer">
            {t('library.video')}
          </a>
        )}
      </Card>

      <Card title={t('library.cues')}>
        <ul className="cues">
          {exercise.cues.map((text, index) => (
            <li key={index}>
              <span>{text}</span>
              <button
                type="button"
                onClick={() =>
                  void saveExercise({ id: exercise.id, cues: exercise.cues.filter((_, i) => i !== index) })
                }
                aria-label={t('common.delete')}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault()
            if (!cue.trim()) return
            void saveExercise({ id: exercise.id, cues: [...exercise.cues, cue.trim()] })
            setCue('')
          }}
        >
          <input className="grow" value={cue} onChange={(e) => setCue(e.target.value)} />
          <button type="submit" className="button button--quiet">{t('library.add_cue')}</button>
        </form>
      </Card>

      <Card title={t('library.upload')}>
        <div
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void receive(e.dataTransfer.files)
          }}
        >
          <span className="mono muted">{t('library.upload_hint')}</span>
          <button type="button" className="button button--quiet" onClick={() => fileInput.current?.click()}>
            {t('library.choose')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => void receive(e.target.files)}
          />
        </div>

        {media && (
          <div className="media-single">
            <button
              type="button"
              className="media-preview"
              aria-label={t('library.open_image')}
              onClick={() => setExpandedMediaId(media.id)}
            >
              <MediaImage mediaId={media.id} variant="full" alt="" loading="lazy" />
            </button>
            <button
              type="button"
              className="media-single__delete"
              aria-label={t('library.delete_image')}
              onClick={() => {
                setExpandedMediaId(null)
                void removeExerciseMedia(media.id)
              }}
            >
              ×
            </button>
          </div>
        )}
      </Card>

      {expandedMediaId && (
        <Modal
          title={exercise.name}
          closeLabel={t('common.close')}
          onClose={() => setExpandedMediaId(null)}
          wide
        >
          <MediaImage
            className="media-lightbox__image"
            mediaId={expandedMediaId}
            variant="full"
            alt={exercise.name}
          />
        </Modal>
      )}

      <DangerZone exercise={exercise} onDeleted={onBack} />
    </div>
  )
}

/**
 * Exclusão do exercício, com a conta do que ela leva junto na frente.
 *
 * O número de treinos afetados importa porque apagar aqui muda o que vai
 * aparecer na próxima sessão — e essa consequência não é óbvia estando na
 * Biblioteca.
 */
function DangerZone({ exercise, onDeleted }: { exercise: Exercise; onDeleted: () => void }) {
  const { t } = useTranslation()
  const { deleteExercise } = useActions()
  const items = useAllTemplateItems().filter((i) => i.exerciseId === exercise.id)
  const templates = useTemplatesEver()
  const logged = useSetLogs().filter((l) => l.exerciseId === exercise.id)
  const [confirming, setConfirming] = useState(false)

  const affected = [...new Set(items.map((i) => i.templateId))]
    .map((id) => templates.find((x) => x.id === id)?.name)
    .filter(Boolean)

  return (
    <Card title={t('settings.danger')} tone="quiet">
      <span className="mono muted">
        {affected.length > 0
          ? t('library.delete_used', { treinos: affected.join(', ') })
          : t('library.delete_unused')}
      </span>
      {logged.length > 0 && (
        <span className="mono muted">{t('library.delete_keeps', { count: logged.length })}</span>
      )}

      {confirming ? (
        <div className="row">
          <button
            type="button"
            className="button button--danger"
            onClick={async () => {
              await deleteExercise(exercise.id)
              onDeleted()
            }}
          >
            {t('library.delete_confirm')}
          </button>
          <button type="button" className="button button--ghost" onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <button type="button" className="button button--ghost" onClick={() => setConfirming(true)}>
          {t('library.delete')}
        </button>
      )}
    </Card>
  )
}
