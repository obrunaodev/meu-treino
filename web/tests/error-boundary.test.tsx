import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/lib/i18n.js'
import { ErrorBoundary } from '../src/components/ErrorBoundary.js'

/**
 * O que precisa ficar provado não é que o componente renderiza — é que um
 * throw no meio do render vira uma tela legível em vez de `<body>` vazio, e
 * que a saída oferecida realmente remonta a árvore.
 */

function Explode({ boom }: { boom: boolean }) {
  if (boom) throw new Error('falha de render forjada')
  return <p>conteúdo normal</p>
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // React relata todo erro capturado no console; sem silenciar, a saída da
  // suíte fica ilegível e um erro REAL passa despercebido no meio do ruído.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
  cleanup()
})

describe('ErrorBoundary', () => {
  it('deixa a árvore passar quando nada quebra', () => {
    render(<ErrorBoundary><Explode boom={false} /></ErrorBoundary>)

    expect(screen.getByText('conteúdo normal')).toBeInTheDocument()
  })

  it('troca a tela branca por mensagem, causa e duas saídas', () => {
    render(<ErrorBoundary><Explode boom /></ErrorBoundary>)

    expect(screen.getByText('Algo quebrou nesta tela')).toBeInTheDocument()
    // A causa crua importa: é o único rastro que o usuário consegue relatar.
    expect(screen.getByText('falha de render forjada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recarregar o app' })).toBeInTheDocument()
  })

  it('diz que o treino registrado sobreviveu', () => {
    render(<ErrorBoundary><Explode boom /></ErrorBoundary>)

    expect(screen.getByText(/fila de sincronização continua intacta/)).toBeInTheDocument()
  })

  it('"tentar de novo" remonta, e o conteúdo volta quando a causa passou', () => {
    let falhas = 1
    const Flaky = () => <Explode boom={falhas > 0} />

    render(<ErrorBoundary><Flaky /></ErrorBoundary>)
    expect(screen.getByText('Algo quebrou nesta tela')).toBeInTheDocument()

    falhas = 0
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(screen.getByText('conteúdo normal')).toBeInTheDocument()
    expect(screen.queryByText('Algo quebrou nesta tela')).not.toBeInTheDocument()
  })
})
