import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ErrorState, Loading, Modal, NumberStepper, Stepper } from '../src/components/ui.js'
import i18n from '../src/lib/i18n.js'

afterEach(async () => {
  cleanup()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  await i18n.changeLanguage('pt-BR')
})

it('names increment controls with their action and field in both languages', async () => {
  render(<><NumberStepper label="Carga" value={20} onChange={vi.fn()} onStep={vi.fn()} />
    <Stepper label="Descanso" value={90} onStep={vi.fn()} /></>)
  expect(screen.getByRole('button', { name: 'Aumentar Carga' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Diminuir Descanso' })).toBeVisible()
  await act(() => i18n.changeLanguage('en-US'))
  expect(screen.getByRole('button', { name: 'Increase Carga' })).toBeVisible()
  expect(document.documentElement.lang).toBe('en-US')
})

it('distinguishes loading from errors and offers a retry action', () => {
  const retry = vi.fn()
  render(<><Loading /><ErrorState message="Falha ao carregar" onRetry={retry} /></>)
  expect(screen.getByRole('status')).toHaveTextContent('Carregando…')
  expect(screen.getByRole('alert')).toHaveTextContent('Falha ao carregar')
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
  expect(retry).toHaveBeenCalledOnce()
})

it('gives the native dialog an accessible title', () => {
  // jsdom has no native dialog implementation; this is the browser boundary.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true, value(this: HTMLDialogElement) { this.open = true },
  })
  render(<Modal title="Imagem do exercício" closeLabel="Fechar" onClose={vi.fn()}><p>Imagem</p></Modal>)
  expect(screen.getByRole('dialog', { name: 'Imagem do exercício' })).toBeVisible()
})
