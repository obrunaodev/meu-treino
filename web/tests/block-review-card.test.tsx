import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../src/lib/i18n'
import { BlockReviewCard } from '../src/components/BlockReviewCard.js'
import type { BlockEffort, DeloadSignal } from '../src/lib/domain/deload.js'

const effort: BlockEffort = { sessions: 6, ratedSets: 40, heavySets: 26, heavyShare: 0.65, painSessions: 2 }
const quiet: DeloadSignal = { suggest: false, reasons: [] }

function renderCard(signal: DeloadSignal, onDismiss = vi.fn()) {
  render(
    <MemoryRouter>
      <BlockReviewCard blockNumber={2} effort={effort} signal={signal} reportHref="/history/reports/period/1/block/p/2" onDismiss={onDismiss} />
    </MemoryRouter>,
  )
  return onDismiss
}

afterEach(() => cleanup())

describe('BlockReviewCard', () => {
  it('bloco pesado: sugere semana leve com os números que levaram a isso', () => {
    renderCard({ suggest: true, reasons: ['effort', 'pain'] })

    expect(screen.getByText(/fechou pesado/i)).toBeInTheDocument()
    expect(screen.getByText('65% das séries de trabalho acima do esforço alvo (limite 50%)')).toBeInTheDocument()
    expect(screen.getByText('Dor nível 4 ou mais em 2 sessões do bloco')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver relatório do bloco' })).toHaveAttribute('href', '/history/reports/period/1/block/p/2')
  })

  it('sem sugestão, o cartão segue o de sempre', () => {
    renderCard(quiet)

    expect(screen.getByText(/bloco 2/i)).toBeInTheDocument()
    expect(screen.queryByText(/fechou pesado/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/séries de trabalho acima/i)).not.toBeInTheDocument()
  })

  it('só o motivo apontado aparece', () => {
    renderCard({ suggest: true, reasons: ['pain'] })

    expect(screen.queryByText(/séries de trabalho acima/i)).not.toBeInTheDocument()
    expect(screen.getByText(/dor nível 4/i)).toBeInTheDocument()
  })

  it('"agora não" avisa quem chamou', () => {
    const onDismiss = renderCard(quiet)

    fireEvent.click(screen.getByRole('button', { name: /agora não/i }))
    expect(onDismiss).toHaveBeenCalled()
  })
})
