import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import '../src/lib/i18n'
import { SyncNotice } from '../src/components/SyncBar'

function renderNotice(conflicts: number, pending: number, online: boolean) {
  return render(
    <MemoryRouter>
      <SyncNotice conflicts={conflicts} pending={pending} online={online} />
    </MemoryRouter>,
  )
}

afterEach(() => cleanup())

describe('SyncNotice', () => {
  it('prioriza conflito e leva para a resolução', () => {
    renderNotice(2, 4, false)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('2 conflitos para resolver')
    expect(screen.getByRole('link')).toHaveAttribute('href', '/conflitos')
  })

  it('mostra offline antes de alterações pendentes', () => {
    renderNotice(0, 4, false)
    expect(screen.getByRole('status')).toHaveTextContent('Offline')
  })

  it('não ocupa a tela quando tudo está sincronizado', () => {
    const { container } = renderNotice(0, 0, true)
    expect(container).toBeEmptyDOMElement()
  })

  it('pode ser fechado pelo botão', () => {
    renderNotice(0, 3, true)

    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('some ao deslizar para baixo', () => {
    renderNotice(0, 3, true)
    const toast = screen.getByRole('status')
    const pointer = (type: string, clientY: number) => {
      const event = new Event(type, { bubbles: true })
      Object.defineProperties(event, {
        clientY: { value: clientY },
        pointerId: { value: 1 },
      })
      fireEvent(toast, event)
    }

    pointer('pointerdown', 100)
    pointer('pointermove', 160)
    pointer('pointerup', 160)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
