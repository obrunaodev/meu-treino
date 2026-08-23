import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import '../src/lib/i18n'
import { SyncNotice } from '../src/components/SyncBar'

function renderNotice(conflicts: number, pending: number, online: boolean) {
  return render(
    <MemoryRouter>
      <SyncNotice conflicts={conflicts} pending={pending} online={online} />
    </MemoryRouter>,
  )
}

describe('SyncNotice', () => {
  it('prioriza conflito e leva para a resolução', () => {
    renderNotice(2, 4, false)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('href', '/conflitos')
    expect(alert).toHaveTextContent('2 conflitos para resolver')
  })

  it('mostra offline antes de alterações pendentes', () => {
    renderNotice(0, 4, false)
    expect(screen.getByRole('status')).toHaveTextContent('Offline')
  })

  it('não ocupa a tela quando tudo está sincronizado', () => {
    const { container } = renderNotice(0, 0, true)
    expect(container).toBeEmptyDOMElement()
  })
})
