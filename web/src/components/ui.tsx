import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * `title` é o rótulo de seção do mockup: mono, versalete, discreto.
 * `heading` é o nome de uma entidade — exercício, treino, equipamento — e no
 * mockup esses aparecem em sans 600, não no estilo de rótulo.
 *
 * Um dos dois vira o <h2>: cada Card é uma <section> e sem nome acessível o
 * leitor de tela anuncia "seção" e mais nada.
 */
/**
 * Select com rótulo associado por id.
 *
 * Com `<label>Texto<select/></label>` o nome acessível do controle absorve o
 * texto de todas as opções — vira "Status concluída incompleta em andamento".
 * A associação explícita deixa o nome ser só o rótulo.
 */
export function Select({ label, value, onChange, children }: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </div>
  )
}

export function Card({ title, heading, action, children, tone }: {
  title?: ReactNode
  heading?: ReactNode
  action?: ReactNode
  children: ReactNode
  tone?: 'quiet' | 'hot'
}) {
  return (
    <section className={`card${tone ? ` card--${tone}` : ''}`}>
      {(title || heading || action) && (
        <header className="card__head">
          {heading
            ? <h2 className="card__name">{heading}</h2>
            : title
              ? <h2 className="card__title">{title}</h2>
              : null}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function Empty({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="muted">{message}</p>
      {action}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <span className="eyebrow">{label}</span>
      <strong className="stat__value">{value}</strong>
      {hint && <span className="mono muted">{hint}</span>}
    </div>
  )
}

/**
 * Stepper de valor numérico. Existe porque a sessão é operada com a mão suada,
 * em pé, olhando para a máquina — digitar num input é pior que dois botões
 * grandes.
 */
export function Stepper({ label, value, onStep, disabled }: {
  label: ReactNode
  value: ReactNode
  onStep: (direction: 1 | -1) => void
  disabled?: boolean
}) {
  return (
    <div className="stepper">
      <span className="stepper__label">{label}</span>
      <div className="stepper__row">
        <button type="button" onClick={() => onStep(-1)} disabled={disabled} aria-label="−">−</button>
        <span className="stepper__value">{value}</span>
        <button type="button" onClick={() => onStep(1)} disabled={disabled} aria-label="+">+</button>
      </div>
    </div>
  )
}

/**
 * Diálogo modal sobre a tela.
 *
 * `<dialog>` nativo e não uma div com overlay: ele traz por conta própria o
 * foco preso dentro, o Esc para fechar e a camada acima de tudo — as três
 * coisas que uma reimplementação erra.
 */
export function Modal({ title, closeLabel, onClose, children, wide = false }: {
  title: ReactNode
  closeLabel: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal--wide' : ''}`}
      onClose={onClose}
      // Alvo igual ao próprio dialog significa clique no backdrop: o conteúdo
      // vive no <div> de dentro e nunca é o alvo aqui.
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close()
      }}
    >
      <div className="modal__panel">
        <header className="modal__head">
          <h2 className="card__title">{title}</h2>
          <button
            type="button"
            className="modal__close"
            aria-label={closeLabel}
            onClick={() => ref.current?.close()}
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
