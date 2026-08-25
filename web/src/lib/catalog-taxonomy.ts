import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { apiFetch } from './api.js'
import { getMeta, setMeta } from './db.js'
import type { CatalogExercise, CatalogGroup } from './types.js'

interface CatalogTaxonomy {
  exercises: Array<{ id: number; groupId: number | null }>
  groups: CatalogGroup[]
}

const EMPTY: CatalogTaxonomy = { exercises: [], groups: [] }

/** Taxonomia global com cache local para os gráficos funcionarem offline. */
export function useCatalogTaxonomy() {
  const cached = useLiveQuery(() => getMeta<CatalogTaxonomy>('catalog-taxonomy', EMPTY), []) ?? EMPTY

  useEffect(() => {
    void Promise.all([
      apiFetch<{ exercises: CatalogExercise[] }>('/api/catalog/exercises?limit=300'),
      apiFetch<{ groups: CatalogGroup[] }>('/api/catalog/groups'),
    ]).then(([exerciseBody, groupBody]) => setMeta('catalog-taxonomy', {
      exercises: exerciseBody.exercises.map(({ id, groupId }) => ({ id, groupId })),
      groups: groupBody.groups,
    })).catch(() => undefined)
  }, [])

  const groupNameById = new Map(cached.groups.map((group) => [group.id, group.name]))
  return new Map(cached.exercises.flatMap((exercise) => {
    if (exercise.groupId === null) return []
    const name = groupNameById.get(exercise.groupId)
    return name ? [[exercise.id, name] as const] : []
  }))
}
