import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../src/lib/i18n'

vi.mock('../src/lib/repo.js', () => ({ usePainEvents: () => [] }))
vi.mock('../src/lib/actions.js', () => ({
  useActions: () => ({ logPain: vi.fn(), removePain: vi.fn() }),
}))
vi.mock('../src/components/PainCapture.js', () => ({
  BodyMap: () => null,
  PainCapture: () => <div>Captura de dor</div>,
  toneForLevel: () => 1,
  usePainRegions: () => [],
}))

import { Pain } from '../src/pages/Pain.js'

afterEach(() => cleanup())

describe('Histórico de dor vazio', () => {
  it('celebra a ausência de dor e oferece o registro', () => {
    render(<Pain />)

    expect(screen.getByText(/você está sem registros de dor/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar dor' }))
    expect(screen.getByText('Captura de dor')).toBeInTheDocument()
  })
})
