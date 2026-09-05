import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  useActiveProgram, useCardioOptions, useExercises, useSessions, useTemplateItems, useTemplates,
} from '../lib/repo.js'
import { useActions } from '../lib/actions.js'
import { routes } from '../lib/routes.js'
import { Card, Empty, Select, Stepper } from '../components/ui.js'
import { RirSelector } from '../components/RirSelector.js'
import { rirLabelKey } from '../lib/domain/rir.js'
import type { Program, Template, TemplateItem } from '../lib/types.js'

export function Templates() {
  const { t } = useTranslation()
  const program = useActiveProgram()
  const templates = useTemplates(program?.id)
  const { addTemplate } = useActions()
  const [activeId, setActiveId] = useState<string | null>(null)

  const current = templates.find((x) => x.id === activeId) ?? templates[0] ?? null

  // O treino selecionado pode sumir — apagado aqui ou por outro dispositivo.
  useEffect(() => {
    if (activeId && !templates.some((x) => x.id === activeId)) setActiveId(null)
  }, [activeId, templates])

  if (!program) return <Empty message={t('dashboard.no_program')} />

  async function create() {
    if (!program) return
    const name = `${t('onboarding.cycle.prefix')} ${String.fromCharCode(65 + templates.length)}`
    const created = await addTemplate(program, name)
    setActiveId(created.id)
  }

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__title">
          <h1>{t('templates.title')}</h1>
          <p className="page__description">{t('pages.templates')}</p>
        </div>
        <button type="button" className="button button--primary" onClick={() => void create()}>
          {t('templates.new')}
        </button>
      </div>

      <span className="mono muted">
        {t('templates.cycle_size', { count: templates.length })}
      </span>

      {templates.length === 0 ? (
        <Empty message={t('templates.empty')} />
      ) : (
        <>
          <div className="pills">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={`pill${current?.id === template.id ? ' pill--on' : ''}`}
                onClick={() => setActiveId(template.id)}
              >
                {template.name}
              </button>
            ))}
          </div>

          {current && (
            <TemplateSettings
              program={program}
              template={current}
              index={templates.findIndex((x) => x.id === current.id)}
              total={templates.length}
              order={templates.map((x) => x.id)}
              onDeleted={() => setActiveId(null)}
            />
          )}

          {current && <TemplateEditor templateId={current.id} />}
          {current && <TemplateCardio template={current} />}
        </>
      )}
    </div>
  )
}

function TemplateCardio({ template }: { template: Template }) {
  const { t } = useTranslation()
  const options = useCardioOptions()
  const { saveTemplate } = useActions()
  const save = (patch: Partial<Template>) => void saveTemplate({ ...patch, id: template.id })

  return (
    <Card title={t('templates.cardio')}>
      {options.length === 0 ? (
        <p className="muted">
          {t('templates.cardio_empty')} <Link to={routes.equipment}>{t('templates.cardio_configure')}</Link>
        </p>
      ) : (
        <>
          <Select
            label={t('templates.cardio_option')}
            value={template.cardioOptionId ?? ''}
            onChange={(value) => save({ cardioOptionId: value || null })}
          >
            <option value="">{t('templates.cardio_none')}</option>
            {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </Select>
          {template.cardioOptionId && (
            <>
              <label className="field">
                {t('templates.cardio_minutes')}
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={Math.round((template.cardioDurationSeconds ?? 1200) / 60)}
                  onChange={(event) => save({ cardioDurationSeconds: Math.max(1, Number(event.target.value)) * 60 })}
                />
              </label>
              <Select
                label={t('session.intensity')}
                value={template.cardioIntensity ?? 'moderado'}
                onChange={(value) => save({ cardioIntensity: value as Template['cardioIntensity'] })}
              >
                {(['leve', 'moderado', 'forte'] as const).map((level) => (
                  <option key={level} value={level}>{t(`session.${level}`)}</option>
                ))}
              </Select>
            </>
          )}
        </>
      )}
    </Card>
  )
}

/**
 * Renomear, mover no ciclo e apagar. Fica num cartão separado do editor de
 * exercícios porque são operações sobre o treino, não dentro dele — e apagar
 * precisa de confirmação bem longe do botão de adicionar exercício.
 */
function TemplateSettings({ program, template, index, total, order, onDeleted }: {
  program: Program
  template: Template
  index: number
  total: number
  order: string[]
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const sessions = useSessions()
  const { saveTemplate, deleteTemplate, reorderTemplates } = useActions()
  const [confirming, setConfirming] = useState(false)

  useEffect(() => setConfirming(false), [template.id])

  const used = sessions.filter((s) => s.templateId === template.id).length
  const last = total <= 1

  async function move(direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= total) return
    const ids = [...order]
    const moved = ids[index]!
    ids[index] = ids[target]!
    ids[target] = moved
    await reorderTemplates(ids)
  }

  async function destroy() {
    if (await deleteTemplate(program, template.id)) onDeleted()
    setConfirming(false)
  }

  return (
    <Card title={t('templates.settings')}>
      <label className="field">
        {t('templates.name')}
        <input
          value={template.name}
          onChange={(e) => void saveTemplate({ id: template.id, name: e.target.value })}
        />
      </label>

      <label className="field">
        {t('templates.focus')}
        <input
          value={template.focus ?? ''}
          placeholder={t('templates.focus_hint')}
          onChange={(e) => void saveTemplate({ id: template.id, focus: e.target.value || null })}
        />
      </label>

      <div className="row-between">
        <span className="mono muted">
          {t('templates.position', { position: index + 1, total })}
        </span>
        <span className="item__move">
          <button type="button" onClick={() => void move(-1)} disabled={index === 0} aria-label={t('templates.move_up')}>↑</button>
          <button type="button" onClick={() => void move(1)} disabled={index === total - 1} aria-label={t('templates.move_down')}>↓</button>
        </span>
      </div>

      {confirming ? (
        <div className="stack stack--tight">
          <span className="mono muted">
            {used > 0
              ? t('templates.delete_used', { count: used })
              : t('templates.delete_confirm')}
          </span>
          <div className="row">
            <button type="button" className="button button--danger" onClick={() => void destroy()}>
              {t('common.delete')}
            </button>
            <button type="button" className="button button--ghost" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button
            type="button"
            className="button button--ghost"
            disabled={last}
            onClick={() => setConfirming(true)}
          >
            {t('templates.delete')}
          </button>
          {last && <span className="mono muted">{t('templates.delete_last')}</span>}
        </div>
      )}
    </Card>
  )
}

function TemplateEditor({ templateId }: { templateId: string }) {
  const { t } = useTranslation()
  const items = useTemplateItems(templateId)
  const exercises = useExercises()
  const { saveTemplateItem, removeTemplateItem, reorderTemplateItems } = useActions()
  const [adding, setAdding] = useState(false)

  const byId = new Map(exercises.map((e) => [e.id, e]))

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const ids = items.map((i) => i.id)
    const moved = ids[index]!
    ids[index] = ids[target]!
    ids[target] = moved
    await reorderTemplateItems(ids)
  }

  return (
    <Card
      title={t('templates.exercises')}
      action={
        <button type="button" className="button button--ghost" onClick={() => setAdding((v) => !v)}>
          {t('templates.add_exercise')}
        </button>
      }
    >
      {adding && (
        <div className="checklist">
          {exercises.length === 0 ? (
            <Link to={routes.exercises} className="button button--quiet">{t('library.add')}</Link>
          ) : (
            exercises.map((exercise) => (
              <button
                key={exercise.id}
                type="button"
                className="checkitem"
                onClick={async () => {
                  await saveTemplateItem({
                    templateId,
                    exerciseId: exercise.id,
                    position: items.length,
                    sets: 3,
                    repMin: 8,
                    repMax: 12,
                    rirTarget: 2,
                    isTimeBased: false,
                    trackingMode: 'compact',
                  })
                  setAdding(false)
                }}
              >
                <span>{exercise.name}</span>
                <span className="mono muted">+</span>
              </button>
            ))
          )}
        </div>
      )}

      {items.length === 0 ? (
        <p className="muted">{t('session.empty_template')}</p>
      ) : (
        <ol className="items">
          {items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              name={byId.get(item.exerciseId)?.name ?? '—'}
              first={index === 0}
              last={index === items.length - 1}
              onMove={(direction) => void move(index, direction)}
              onSave={(patch) => void saveTemplateItem({ ...patch, id: item.id })}
              onRemove={() => void removeTemplateItem(item.id)}
            />
          ))}
        </ol>
      )}
    </Card>
  )
}

function ItemRow({ item, name, first, last, onMove, onSave, onRemove }: {
  item: TemplateItem
  name: string
  first: boolean
  last: boolean
  onMove: (direction: -1 | 1) => void
  onSave: (patch: Partial<TemplateItem>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const range = item.isTimeBased
    ? `${item.repMin ?? 0}–${item.repMax ?? 0}s`
    : `${item.repMin ?? 0}–${item.repMax ?? 0}`

  return (
    <li className="item">
      <div className="item__head">
        <button type="button" className="item__name" onClick={() => setOpen((v) => !v)}>
          <strong>{name}</strong>
          <span className="mono muted">
            {t('session.target', {
              sets: item.sets, range,
              effort: rirLabelKey(item.rirTarget) ? t(rirLabelKey(item.rirTarget)!) : '—',
            })}
          </span>
        </button>
        <div className="item__move">
          <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label={t('templates.move_up')}>↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={last} aria-label={t('templates.move_down')}>↓</button>
        </div>
      </div>

      {open && (
        <div className="item__edit">
          <Stepper
            label={t('templates.sets')}
            value={item.sets}
            onStep={(d) => onSave({ sets: Math.max(1, item.sets + d) })}
          />
          <Stepper
            label={`${t('templates.reps')} min`}
            value={item.repMin ?? 0}
            onStep={(d) => onSave({ repMin: Math.max(0, (item.repMin ?? 0) + d) })}
          />
          <Stepper
            label={`${t('templates.reps')} max`}
            value={item.repMax ?? 0}
            onStep={(d) => onSave({ repMax: Math.max(0, (item.repMax ?? 0) + d) })}
          />
          <RirSelector
            label={t('rir.target_label')}
            value={item.rirTarget}
            onChange={(rirTarget) => onSave({ rirTarget })}
          />
          <Stepper
            label={t('templates.rest')}
            value={`${item.restSeconds ?? '—'}`}
            onStep={(d) => onSave({ restSeconds: Math.max(15, (item.restSeconds ?? 90) + d * 15) })}
          />
          <label className="field field--inline">
            <input
              type="checkbox"
              checked={item.isTimeBased}
              onChange={(e) => onSave({ isTimeBased: e.target.checked })}
            />
            {t('templates.time_based')}
          </label>
          <Select
            label={t('templates.tracking_mode')}
            value={item.trackingMode ?? 'compact'}
            onChange={(trackingMode) => onSave({ trackingMode: trackingMode as TemplateItem['trackingMode'] })}
          >
            <option value="compact">{t('templates.tracking_compact')}</option>
            <option value="full">{t('templates.tracking_full')}</option>
          </Select>
          <button type="button" className="button button--ghost" onClick={onRemove}>
            {t('templates.remove')}
          </button>
        </div>
      )}
    </li>
  )
}
