import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { AdminPresetEditor } from '../components/AdminPresetEditor.js'
import { Card, Empty, ErrorState, Loading } from '../components/ui.js'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isAdmin = user?.roles.includes('admin') === true

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [result, choices] = await Promise.all([
        apiFetch<{ presets: AdminPreset[] }>('/api/admin/presets'),
        apiFetch<{ exercises: CatalogChoice[] }>('/api/catalog/exercises?limit=300'),
      ])
      setPresets(result.presets)
      setCatalog(choices.exercises)
    } catch { setError('common.load_error') } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (isAdmin) void reload()
  }, [isAdmin, reload])

  if (!user?.roles.includes('admin')) return <Navigate to={routes.dashboard} replace />

  async function edit(id: string) {
    setError(null)
    try { setEditing(await apiFetch<AdminPreset>(`/api/admin/presets/${id}`)) }
    catch { setError('common.load_error') }
  }

  async function save() {
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch(editing.id ? `/api/admin/presets/${editing.id}` : '/api/admin/presets', {
        method: editing.id ? 'PUT' : 'POST', body: JSON.stringify(presetPayload(editing)),
      })
      setEditing(null)
      await reload()
    } catch { setError('common.save_error') } finally {
      setSaving(false)
    }
  }

  async function remove(preset: AdminPreset) {
    const name = preset.name[i18n.language.startsWith('pt') ? 'pt-BR' : 'en-US']
    if (!window.confirm(t('admin_presets.delete_confirm', { name }))) return
    try {
      await apiFetch(`/api/admin/presets/${preset.id}`, { method: 'DELETE' })
      await reload()
    } catch { setError('common.save_error') }
  }

  return <div className="page">
    <header className="page__head">
      <div className="page__title"><h1>{t('admin_presets.title')}</h1><p className="page__description">{t('admin_presets.description')}</p></div>
      {!editing && <button type="button" className="button button--primary" disabled={loading || error === 'common.load_error'}
        onClick={() => setEditing(blankAdminPreset())}>{t('admin_presets.create')}</button>}
    </header>
    {error && <ErrorState message={t(error)} onRetry={error === 'common.load_error' ? () => void reload() : undefined} />}
    {editing ? <Card heading={editing.id ? t('admin_presets.edit') : t('admin_presets.create')}>
      <AdminPresetEditor value={editing} catalog={catalog} saving={saving}
        onChange={setEditing} onSave={() => void save()} onCancel={() => setEditing(null)} />
    </Card> : loading ? <Loading /> : error ? null : presets.length === 0 ? <Empty message={t('admin_presets.empty')} /> : <div className="admin-preset-list">
      {presets.map((preset) => <Card key={preset.id} heading={preset.name[i18n.language.startsWith('pt') ? 'pt-BR' : 'en-US']}>
        <span className="mono muted">{preset.split.toUpperCase()} · {t(`onboarding.preset.${preset.focus}`)} · {preset.durationMinutes} min</span>
        <span className="mono muted">
          {t(preset.isPublished ? 'admin_presets.published' : 'admin_presets.draft')}
        </span>
        <div className="row">
          <button type="button" className="button button--quiet" onClick={() => void edit(preset.id!)}>{t('common.edit')}</button>
          <button type="button" className="button button--ghost" onClick={() => void remove(preset)}>{t('common.delete')}</button>
        </div>
      </Card>)}
    </div>}
  </div>
}
