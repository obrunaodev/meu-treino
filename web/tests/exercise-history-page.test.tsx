import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../src/lib/i18n'
import { localDb } from '../src/lib/db.js'
import { ExerciseHistory } from '../src/pages/ExerciseHistory.js'

// Página só de leitura, direto do IndexedDB. O gráfico mede a largura com
// ResizeObserver, que o jsdom não tem — é a única API do navegador simulada.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
const OWNER = '00000000-0000-7000-8000-000000000031'
const base = { ownerId: OWNER, updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null }

async function seedSessions(count: number, exercise: Record<string, unknown> | null = { name: 'Supino reto' }) {
  if (exercise) {
    await localDb.table_('exercises').put({
      ...base, id: 'supino', cues: [], equipmentId: null, catalogExerciseId: null, loadPerSide: false, ...exercise,
    } as never)
  }
  for (let index = 0; index < count; index++) {
    const startedAt = new Date(2026, 7, index + 1, 12).toISOString()
    await localDb.table_('workout_sessions').put({
      ...base, id: `s${index}`, programId: 'p', templateId: 't', status: 'concluida', startedAt,
      planSnapshot: {
        version: 1, capturedAt: startedAt, templateId: 't', templateName: 'Treino A',
        items: [{ exerciseId: 'supino', exerciseName: 'Supino capturado', loadPerSide: false, equipment: null }],
      },
    } as never)
    await localDb.table_('set_logs').put({
      ...base, id: `x${index}`, sessionId: `s${index}`, templateItemId: null, exerciseId: 'supino', setIndex: 0,
      isWarmup: false, side: 'ambos', weightKg: 60 + index, plateCount: null, reps: 10, seconds: null, rir: 2,
      skipped: false, hadPain: false, completedAt: startedAt,
    } as never)
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/history/exercises/supino']}>
      <Routes><Route path="/history/exercises/:exerciseId" element={<ExerciseHistory />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await localDb.delete()
  await localDb.open()
})

afterEach(() => cleanup())

describe('ExerciseHistory', () => {
  it('mostra nome, resumo e as sessões com as séries', async () => {
    await seedSessions(2)
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Supino reto', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/2 sessões · 2 séries de trabalho desde/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Abrir sessão' })).toHaveLength(2)
  })

  it('troca a métrica do gráfico', async () => {
    await seedSessions(2)
    renderPage()
    const metrics = await screen.findByRole('group', { name: 'Métrica' })

    fireEvent.click(within(metrics).getByRole('button', { name: '1RM estimado' }))
    expect(within(metrics).getByRole('button', { name: '1RM estimado' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(metrics).getByRole('button', { name: 'Maior carga' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('mostra a tabela do gráfico na unidade escolhida', async () => {
    await seedSessions(1)
    await localDb.table_('user_settings').put({ ...base, id: 'settings', unit: 'lb' } as never)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'ver tabela' }))
    // 60 kg → 132,3 lb
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('132.3'))
  })

  it('mostra as sessões mais antigas sob demanda', async () => {
    await seedSessions(11)
    renderPage()

    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Abrir sessão' })).toHaveLength(10))
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar sessões mais antigas' }))
    expect(screen.getAllByRole('link', { name: 'Abrir sessão' })).toHaveLength(11)
  })

  it('exercício apagado continua com histórico e o nome capturado', async () => {
    await seedSessions(1, null)
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Supino capturado', level: 1 })).toBeInTheDocument()
  })
})
