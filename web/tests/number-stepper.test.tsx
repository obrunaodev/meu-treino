import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NumberStepper } from '../src/components/ui.js'

describe('NumberStepper', () => {
  it('accepts direct numeric entry and keeps increment buttons', () => {
    const onChange = vi.fn()
    const onStep = vi.fn()
    render(<NumberStepper label="Carga" value={70} suffix="kg" onChange={onChange} onStep={onStep} />)

    fireEvent.change(screen.getByRole('spinbutton', { name: /carga/i }), { target: { value: '72.5' } })
    fireEvent.click(screen.getByRole('button', { name: '+' }))

    expect(onChange).toHaveBeenCalledWith(72.5)
    expect(onStep).toHaveBeenCalledWith(1)
  })

  it('allows clearing before typing a replacement value', () => {
    const onChange = vi.fn()
    render(<NumberStepper label="Repetições" value={12} onChange={onChange} onStep={vi.fn()} />)

    fireEvent.change(screen.getByRole('spinbutton', { name: /repetições/i }), { target: { value: '' } })

    expect(onChange).toHaveBeenCalledWith(null)
  })
})
