import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCardioOptions, useEquipment, useGyms } from '../lib/repo.js'
import { useActions } from '../lib/actions.js'
import { Card, Empty, Select } from '../components/ui.js'
import type { Equipment as EquipmentRow } from '../lib/types.js'

const LOAD_TYPES = ['pino', 'anilha', 'livre', 'corporal'] as const

export function Equipment() {
  const { t } = useTranslation()
  const equipment = useEquipment()
  const gyms = useGyms()
  const cardio = useCardioOptions()
  const { saveCardioOption, removeCardioOption, saveEquipment } = useActions()
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__title">
          <h1>{t('equipment.title')}</h1>
          <p className="page__description">{t('pages.academy')}</p>
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={async () => {
            const created = await saveEquipment({
              name: t('equipment.add'),
              loadType: 'pino',
              plateTable: [],
              gymId: gyms[0]?.id ?? null,
            })
            setOpenId(created.id)
          }}
        >
          {t('equipment.add')}
        </button>
      </div>

      {equipment.length === 0 ? (
        <Empty message={t('equipment.empty')} />
      ) : (
        equipment.map((item) => (
          <EquipmentCard
            key={item.id}
            item={item}
            open={openId === item.id}
            onToggle={() => setOpenId(openId === item.id ? null : item.id)}
          />
        ))
      )}

      <Card
        title={t('equipment.cardio_title')}
        action={
          <button
            type="button"
            className="button button--primary"
            onClick={() => void saveCardioOption({
              gymId: gyms[0]?.id ?? null,
              name: t('equipment.cardio_add'),
              notes: null,
            })}
          >
            {t('equipment.cardio_add')}
          </button>
        }
      >
        {cardio.length === 0 ? (
          <p className="muted">{t('equipment.cardio_empty')}</p>
        ) : (
          <div className="stack stack--tight">
            {cardio.map((option) => (
              <div className="row-between" key={option.id}>
                <input
                  aria-label={t('equipment.cardio_name')}
                  value={option.name}
                  onChange={(event) => void saveCardioOption({ id: option.id, name: event.target.value })}
                />
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => void removeCardioOption(option.id)}
                >
                  {t('common.delete')}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function EquipmentCard({ item, open, onToggle }: {
  item: EquipmentRow
  open: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const { saveEquipment, removeEquipment } = useActions()
  const save = (patch: Partial<EquipmentRow>) => void saveEquipment({ ...patch, id: item.id })

  return (
    <Card
      heading={item.name}
      action={
        <button type="button" className="button button--ghost" onClick={onToggle}>
          {open ? t('common.close') : t('common.edit')}
        </button>
      }
    >
      <span className="mono muted">
        {t(`equipment.${item.loadType}`)}
        {item.plateTable.length > 0 && ` · ${item.plateTable.length} × ${t('session.plate')}`}
      </span>

      {open && (
        <>
          <label className="field">
            {t('library.name')}
            <input value={item.name} onChange={(e) => save({ name: e.target.value })} />
          </label>

          <Select
            label={t('equipment.load_type')}
            value={item.loadType}
            onChange={(value) => save({ loadType: value })}
          >
            {LOAD_TYPES.map((type) => (
              <option key={type} value={type}>{t(`equipment.${type}`)}</option>
            ))}
          </Select>

          {item.loadType === 'pino' ? (
            <div className="stack stack--tight">
              <span className="eyebrow">{t('equipment.plate_table')}</span>
              <span className="mono muted">{t('equipment.plate_hint')}</span>
              <div className="plates">
                {item.plateTable.map((kg, index) => (
                  <label key={index} className="plate">
                    <span className="mono muted">{index + 1}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      value={kg}
                      onChange={(e) =>
                        save({
                          plateTable: item.plateTable.map((v, i) =>
                            i === index ? Number(e.target.value) : v),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="row">
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => save({ plateTable: [...item.plateTable, 0] })}
                >
                  {t('equipment.plate_add')}
                </button>
                {item.plateTable.length > 0 && (
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => save({ plateTable: item.plateTable.slice(0, -1) })}
                  >
                    −
                  </button>
                )}
              </div>
            </div>
          ) : (
            <label className="field">
              {t('equipment.increment')}
              <input
                type="number"
                step="0.5"
                inputMode="decimal"
                value={item.incrementKg ?? ''}
                onChange={(e) => save({ incrementKg: e.target.value ? Number(e.target.value) : null })}
              />
              <span className="mono muted">{t('equipment.increment_hint')}</span>
            </label>
          )}

          <label className="field">
            {t('equipment.notes')}
            <textarea value={item.notes ?? ''} onChange={(e) => save({ notes: e.target.value })} />
          </label>

          <button type="button" className="button button--ghost" onClick={() => void removeEquipment(item.id)}>
            {t('common.delete')}
          </button>
        </>
      )}
    </Card>
  )
}
