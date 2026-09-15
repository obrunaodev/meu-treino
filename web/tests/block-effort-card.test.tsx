import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../src/lib/i18n'
import { BlockEffortCard } from '../src/components/BlockEffortCard.js'
import type { BlockEffort } from '../src/lib/domain/deload.js'

const effort = (patch: Partial<BlockEffort> = {}): BlockEffort => ({
  sessions: 6, ratedSets: 40, heavySets: 10, heavyShare: 0.25, painSessions: 0, ...patch,
})

afterEach(() => cleanup())

describe('BlockEffortCard', () => {
  it('sem sessões suficientes, diz que ainda não dá para ler', () => {
    render(<BlockEffortCard effort={null} />)
    expect(screen.getByText(/ainda não dá para ler/i)).toBeInTheDocument()
  })

  it('bloco tranquilo mostra os números e o limite sem sugerir nada', () => {
    render(<BlockEffortCard effort={effort()} />)

    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('10 de 40 séries avaliadas · sugere a partir de 50%')).toBeInTheDocument()
    expect(screen.getByText(/nada indica/i)).toBeInTheDocument()
  })

  it('bloco pesado diz que sugere semana leve', () => {
    render(<BlockEffortCard effort={effort({ heavySets: 26, heavyShare: 0.65 })} />)
    expect(screen.getByText(/considere uma semana mais leve/i)).toBeInTheDocument()
  })
})
