import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../src/lib/i18n'

const startSession = vi.fn()
const fixtures = vi.hoisted(() => ({ sessions: [] as Array<Record<string, unknown>> }))

vi.mock('../src/lib/repo.js', () => ({
  useActiveProgram: () => ({
    id: 'program', sessionsPerCycle: 2, cyclesPerBlock: 4,
  }),
  useTemplates: () => [
    { id: 'a', programId: 'program', position: 0, name: 'Treino A', focus: 'Peitoral' },
    { id: 'b', programId: 'program', position: 1, name: 'Treino B', focus: 'Costas' },
  ],
  useSessions: () => fixtures.sessions,
  useAllTemplateItems: () => [
    { id: 'a1', templateId: 'a', exerciseId: 'supino', position: 0, sets: 3, repMin: 10, repMax: 15, rirTarget: 2, isTimeBased: false },
    { id: 'b1', templateId: 'b', exerciseId: 'remada', position: 0, sets: 4, repMin: 8, repMax: 12, rirTarget: 1, isTimeBased: false },
  ],
  useExercises: () => [
    { id: 'supino', name: 'Supino reto' },
    { id: 'remada', name: 'Remada baixa' },
  ],
  useOpenSession: () => null,
}))

vi.mock('../src/lib/actions.js', () => ({ useActions: () => ({ startSession }) }))

import { SessionGate } from '../src/pages/SessionGate.js'

afterEach(() => {
  cleanup()
  fixtures.sessions = []
})

describe('SessionGate', () => {
  it('mostra o treino sugerido antes de iniciar', () => {
    render(<MemoryRouter><SessionGate /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Treino A' })).toBeInTheDocument()
    expect(screen.getByText('Supino reto')).toBeInTheDocument()
    expect(screen.getByText('3 × 10–15 · Moderado')).toBeInTheDocument()
    expect(startSession).not.toHaveBeenCalled()
  })

  it('sugere pelo rodízio do programa ativo, ignorando sessões de outro programa', () => {
    fixtures.sessions = [
      { id: 's1', programId: 'program', templateId: 'a', status: 'concluida', startedAt: '2026-09-01T10:00:00.000Z' },
      // Mais recente, mas de outro programa: não pode reiniciar o ciclo deste.
      { id: 's2', programId: 'antigo', templateId: 'x', status: 'concluida', startedAt: '2026-09-05T10:00:00.000Z' },
    ]
    render(<MemoryRouter><SessionGate /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Treino B' })).toBeInTheDocument()
  })

  it('troca a prévia sem iniciar uma sessão', () => {
    render(<MemoryRouter><SessionGate /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Escolher outro treino' }))
    fireEvent.click(screen.getByRole('button', { name: /Treino B/ }))

    expect(screen.getByRole('heading', { name: 'Treino B' })).toBeInTheDocument()
    expect(screen.getByText('Remada baixa')).toBeInTheDocument()
    expect(startSession).not.toHaveBeenCalled()
  })
})
