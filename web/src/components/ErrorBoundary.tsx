import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from './ui.js'

/**
 * Última linha entre um erro de render e a tela branca.
 *
 * Sem isto, qualquer exceção durante o render desmonta a árvore inteira e o
 * usuário fica olhando para nada — no meio de um treino, em pé na academia,
 * sem saber se o que registrou sobreviveu. Sobreviveu: a fonte da verdade é o
 * IndexedDB e a fila do outbox continua intacta na origem. O que quebrou foi
 * só a tela, e é exatamente isso que a cópia precisa dizer antes de oferecer
 * as duas saídas.
 *
 * Classe porque não existe equivalente em hook: `componentDidCatch` e
 * `getDerivedStateFromError` só existem na API de classe.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Não há coletor remoto: o console é o único lugar onde a pilha e o trecho
    // de componente sobrevivem para quem abrir o DevTools depois.
    console.error('erro de render capturado pelo ErrorBoundary', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <ErrorFallback error={this.state.error} onRetry={() => this.setState({ error: null })} />
  }
}

/**
 * Separado da classe porque `useTranslation` é hook e a classe não pode chamá-lo.
 *
 * "Tentar de novo" só remonta a árvore — resolve o erro transitório, que é a
 * maioria. "Recarregar" existe para quando o estado em memória é a causa e
 * remontar cairia no mesmo erro.
 */
function ErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useTranslation()

  return (
    <main className="centered">
      <div className="error-boundary">
        <Card title={t('error_boundary.title')}>
          <p>{t('error_boundary.body')}</p>
          <p className="mono muted error-boundary__detail">{error.message}</p>
          <div className="error-boundary__actions">
            <button type="button" className="button button--primary" onClick={onRetry}>
              {t('error_boundary.retry')}
            </button>
            <button type="button" className="button button--quiet" onClick={() => window.location.reload()}>
              {t('error_boundary.reload')}
            </button>
          </div>
        </Card>
      </div>
    </main>
  )
}
