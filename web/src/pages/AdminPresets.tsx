import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { AdminPresetEditor } from '../components/AdminPresetEditor.js'
import { Card, Empty } from '../components/ui.js'
import { apiFetch } from '../lib/api.js'
import { blankAdminPreset, presetPayload, type AdminPreset } from '../lib/admin-presets.js'
import { useAuth } from '../lib/auth.js'
import { routes } from '../lib/routes.js'

interface CatalogChoice { id: number; name: string }

export function AdminPresets() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [presets, setPresets] = useState<AdminPreset[]>([])
  const [catalog, setCatalog] = useState<CatalogChoice[]>([])
  const [editing, setEditing] = useState<AdminPreset | null>(null)
  const [saving, setSaving] = useState(false)

  async function reload() {
    const result = await apiFetch<{ presets: AdminPreset[] }>('/api/admin/presets')
    setPresets(result.presets)
  }

  useEffect(() => {
    if (!user?.roles.includes('admin')) return
    void Promise.all([
      reload(),
      apiFetch<{ exercises: CatalogChoice[] }>('/api/catalog/exercises?limit=300')
        .then((result) => setCatalog(result.exercises)),
    ])
  }, [user?.id])

  if (!user?.roles.includes('admin')) return <Navigate to={routes.dashboard} replace />

  async function edit(id: string) {
    setEditing(await apiFetch<AdminPreset>(`/api/admin/presets/${id}`))
  }

  async function save() {
    if (!editing) return
    setSaving(true)
    try {
      await apiFetch(editing.id ? `/api/admin/presets/${editing.id}` : '/api/admin/presets', {
        method: editing.id ? 'PUT' : 'POST', body: JSON.stringify(presetPayload(editing)),
      })
      setEditing(null)
      await reload()
    } finally {
      setSaving(false)
    }
  }

  async function remove(preset: AdminPreset) {
    const name = preset.name[i18n.language.startsWith('pt') ? 'pt-BR' : 'en-US']
    if (!window.confirm(t('admin_presets.delete_confirm', { name }))) return
    await apiFetch(`/api/admin/presets/${preset.id}`, { method: 'DELETE' })
    await reload()
  }

  return <div className="page">
    <header className="page__title row-between">
      <div><h1>{t('admin_presets.title')}</h1><p className="page__description">{t('admin_presets.description')}</p></div>
      {!editing && <button type="button" className="button button--primary"
        onClick={() => setEditing(blankAdminPreset())}>{t('admin_presets.create')}</button>}
    </header>
    {editing ? <Card heading={editing.id ? t('admin_presets.edit') : t('admin_presets.create')}>
      <AdminPresetEditor value={editing} catalog={catalog} saving={saving}
        onChange={setEditing} onSave={() => void save()} onCancel={() => setEditing(null)} />
    </Card> : presets.length === 0 ? <Empty message={t('admin_presets.empty')} /> : <div className="admin-preset-list">
      {presets.map((preset) => <Card key={preset.id} heading={preset.name[i18n.language.startsWith('pt') ? 'pt-BR' : 'en-US']}>
        <span className="mono muted">{preset.split.toUpperCase()} · {t(`onboarding.preset.${preset.focus}`)} · {preset.durationMinutes} min</span>
        <span className={preset.isPublished ? 'status status--good' : 'status'}>
          {t(preset.isPublished ? 'admin_presets.published' : 'admin_presets.draft')}
        </span>
        <div className="row-actions">
          <button type="button" className="text-action" onClick={() => void edit(preset.id!)}>{t('common.edit')}</button>
          <button type="button" className="text-action" onClick={() => void remove(preset)}>{t('common.delete')}</button>
        </div>
      </Card>)}
    </div>}
  </div>
}
