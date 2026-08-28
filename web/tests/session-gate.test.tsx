import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../src/lib/i18n'

const startSession = vi.fn()

vi.mock('../src/lib/repo.js', () => ({
  useActiveProgram: () => ({
    id: 'program', sessionsPerCycle: 2, cyclesPerBlock: 4,
  }),
  useTemplates: () => [
    { id: 'a', programId: 'program', position: 0, name: 'Treino A', focus: 'Peitoral' },
    { id: 'b', programId: 'program', position: 1, name: 'Treino B', focus: 'Costas' },
  ],
  useSessions: () => [],
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

afterEach(() => cleanup())

describe('SessionGate', () => {
  it('mostra o treino sugerido antes de iniciar', () => {
    render(<MemoryRouter><SessionGate /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Treino A' })).toBeInTheDocument()
    expect(screen.getByText('Supino reto')).toBeInTheDocument()
    expect(screen.getByText('3 × 10–15 · RIR 2')).toBeInTheDocument()
    expect(startSession).not.toHaveBeenCalled()
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
