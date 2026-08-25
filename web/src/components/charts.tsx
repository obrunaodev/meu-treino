import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Gráficos em SVG inline, sem biblioteca.
 *
 * Todos são de série única, então não há legenda — o título já diz o que está
 * plotado, e uma caixa com um swatch só repetiria isso. Cor vem de tokens CSS
 * (`--viz-*`), nunca de hex aqui dentro, para o modo escuro trocar num lugar só.
 * Texto usa token de texto; a cor da série fica nas marcas.
 */

const PAD = { top: 16, right: 16, bottom: 26, left: 34 }

interface Point {
  label: string
  value: number
  hint?: string
}

function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setWidth(Math.max(280, Math.floor(element.clientWidth)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

/** Ticks em números redondos: eles carregam os valores que não rotulamos. */
function niceTicks(max: number, count = 3): number[] {
  if (max <= 0) return [0]
  const raw = max / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10
  const ticks: number[] = []
  for (let value = 0; value <= max + step / 2; value += step) ticks.push(Number(value.toFixed(2)))
  return ticks
}

function TableView({ points, unit }: { points: Point[]; unit: string }) {
  const { t } = useTranslation()
  return (
    <table className="viz-table">
      <caption className="sr-only">{unit}</caption>
      <thead>
        <tr>
          <th scope="col">{t('viz.period')}</th>
          <th scope="col">{unit}</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.label}>
            <th scope="row">{p.label}</th>
            <td>{p.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Colunas para magnitude. Barra fina com topo arredondado e base quadrada,
 * separada da vizinha por um vão na cor da superfície — nunca por contorno.
 */
export function ColumnChart({ points, unit, height = 150, selectedIndex, onSelect }: {
  points: Point[]
  unit: string
  height?: number
  selectedIndex?: number
  onSelect?: (index: number) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const { t } = useTranslation()
  const titleId = useId()
  const chart = useChartWidth()

  if (points.length === 0) return null
  if (table) {
    return (
      <div className="viz" ref={chart.ref}>
        <TableView points={points} unit={unit} />
        <button type="button" className="viz__toggle" onClick={() => setTable(false)}>
          {t('viz.show_chart')}
        </button>
      </div>
    )
  }

  const width = chart.width
  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const max = Math.max(...points.map((p) => p.value), 1)
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1] ?? max

  const band = plotW / points.length
  const barWidth = Math.min(24, band - 8)
  const y = (value: number) => PAD.top + plotH - (value / top) * plotH

  return (
    <div className="viz" ref={chart.ref}>
      <svg
        width={width}
        height={height}
        className="viz__svg"
        role="img"
        aria-labelledby={titleId}
        onPointerLeave={() => setHover(null)}
      >
        <title id={titleId}>{unit}</title>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              className="viz__grid"
            />
            <text x={PAD.left - 6} y={y(tick) + 3} className="viz__tick" textAnchor="end">
              {tick}
            </text>
          </g>
        ))}

        {points.map((point, index) => {
          const x = PAD.left + band * index + (band - barWidth) / 2
          const barHeight = Math.max(0, PAD.top + plotH - y(point.value))
          const isSelected = index === (selectedIndex ?? points.length - 1)
          return (
            <g
              key={point.label}
              onPointerEnter={() => setHover(index)}
              onClick={() => onSelect?.(index)}
              onKeyDown={(event) => {
                if (onSelect && (event.key === 'Enter' || event.key === ' ')) onSelect(index)
              }}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={onSelect ? `${point.label}: ${point.value} ${unit}` : undefined}
            >
              {/* Alvo de hover maior que a marca: barra fina é difícil de acertar. */}
              <rect
                x={PAD.left + band * index}
                y={PAD.top}
                width={band}
                height={plotH}
                fill="transparent"
              />
              <path
                d={roundedTopBar(x, y(point.value), barWidth, barHeight)}
                className={[
                  'viz__bar',
                  isSelected ? 'viz__bar--last' : '',
                  hover === index ? 'viz__bar--hot' : '',
                ].filter(Boolean).join(' ')}
              />
              <text x={x + barWidth / 2} y={height - 8} className="viz__tick" textAnchor="middle">
                {point.label}
              </text>
              {/* Rótulo direto só no último: valor em toda coluna vira ruído. */}
              {isSelected && point.value > 0 && (
                <text x={x + barWidth / 2} y={y(point.value) - 6} className="viz__value" textAnchor="middle">
                  {point.value}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {hover !== null && points[hover] && (
        <div className="viz__tip">
          <strong>{points[hover]!.label}</strong>
          <span>{points[hover]!.value} {unit}</span>
        </div>
      )}

      <button type="button" className="viz__toggle" onClick={() => setTable(true)}>
        {t('viz.show_table')}
      </button>
    </div>
  )
}

/** Barras horizontais para comparar categorias com rótulos longos. */
export function HorizontalBarChart({ points, unit }: { points: Point[]; unit: string }) {
  const [table, setTable] = useState(false)
  const { t } = useTranslation()
  const max = Math.max(...points.map((point) => point.value), 1)

  if (points.length === 0) return null
  if (table) {
    return (
      <div className="viz">
        <TableView points={points} unit={unit} />
        <button type="button" className="viz__toggle" onClick={() => setTable(false)}>
          {t('viz.show_chart')}
        </button>
      </div>
    )
  }

  return (
    <div className="viz">
      <ul className="hbars">
        {points.map((point, index) => (
          <li key={point.label}>
            <div className="hbars__label">
              <span>{point.label}</span>
              <strong>{point.value}</strong>
            </div>
            <div className="hbars__track">
              <div
                className={`hbars__fill${index === 0 ? ' hbars__fill--lead' : ''}`}
                style={{ width: `${(point.value / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="viz__toggle" onClick={() => setTable(true)}>
        {t('viz.show_table')}
      </button>
    </div>
  )
}

/** Topo arredondado em 4px, base reta: a barra cresce de uma linha única. */
function roundedTopBar(x: number, y: number, width: number, height: number): string {
  const r = Math.min(4, width / 2, height)
  if (height <= 0) return ''
  return [
    `M ${x} ${y + height}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height}`,
    'Z',
  ].join(' ')
}

/** Linha para tendência no tempo. Série única: sem legenda, rótulo só na ponta. */
export function LineChart({ points, unit, height = 150 }: {
  points: Point[]
  unit: string
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const { t } = useTranslation()
  const titleId = useId()
  const fillId = useId()
  const chart = useChartWidth()

  if (points.length === 0) return null
  if (table) {
    return (
      <div className="viz" ref={chart.ref}>
        <TableView points={points} unit={unit} />
        <button type="button" className="viz__toggle" onClick={() => setTable(false)}>
          {t('viz.show_chart')}
        </button>
      </div>
    )
  }

  const width = chart.width
  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const values = points.map((p) => p.value)
  const dataMax = Math.max(...values)
  const dataMin = Math.min(...values)
  const spread = dataMax - dataMin
  // Uma linha de carga precisa mostrar a variação entre sessões; começar
  // sempre em zero achata uma progressão real de 100 para 105 kg.
  const padding = spread > 0 ? Math.max(spread * 0.2, dataMax * 0.02) : Math.max(dataMax * 0.08, 1)
  const min = Math.max(0, dataMin - padding)
  const top = Math.max(dataMax + padding, min + 1)
  const ticks = Array.from({ length: 4 }, (_, index) =>
    Number((min + ((top - min) * index) / 3).toFixed(1)),
  )

  const x = (index: number) =>
    PAD.left + (points.length === 1 ? plotW / 2 : (plotW * index) / (points.length - 1))
  const y = (value: number) => PAD.top + plotH - ((value - min) / (top - min || 1)) * plotH

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ')
  const area = `${path} L ${x(points.length - 1)} ${PAD.top + plotH} L ${x(0)} ${PAD.top + plotH} Z`
  const last = points[points.length - 1]!

  return (
    <div className="viz" ref={chart.ref}>
      <svg
        width={width}
        height={height}
        className="viz__svg"
        role="img"
        aria-labelledby={titleId}
        onPointerLeave={() => setHover(null)}
      >
        <title id={titleId}>{unit}</title>

        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} className="viz__grid" />
            <text x={PAD.left - 6} y={y(tick) + 3} className="viz__tick" textAnchor="end">
              {tick}
            </text>
          </g>
        ))}

        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" className="viz__wash-top" />
          <stop offset="100%" className="viz__wash-bottom" />
        </linearGradient>
        <path d={area} fill={`url(#${fillId})`} />
        <path d={path} className="viz__line" />

        {points.map((point, index) => (
          <g key={`${point.label}-${index}`} onPointerEnter={() => setHover(index)}>
            <rect
              x={x(index) - plotW / (points.length * 2) - 4}
              y={PAD.top}
              width={plotW / points.length + 8}
              height={plotH}
              fill="transparent"
            />
            {(hover === index || index === points.length - 1) && (
              <circle cx={x(index)} cy={y(point.value)} r={4} className="viz__dot" />
            )}
          </g>
        ))}

        <text x={x(points.length - 1)} y={y(last.value) - 10} className="viz__value" textAnchor="end">
          {last.value}
        </text>

        {points.length > 1 && (
          <>
            <text x={PAD.left} y={height - 8} className="viz__tick" textAnchor="start">
              {points[0]!.label}
            </text>
            <text x={width - PAD.right} y={height - 8} className="viz__tick" textAnchor="end">
              {last.label}
            </text>
          </>
        )}
      </svg>

      {hover !== null && points[hover] && (
        <div className="viz__tip">
          <strong>{points[hover]!.label}</strong>
          <span>{points[hover]!.value} {unit}</span>
        </div>
      )}

      <button type="button" className="viz__toggle" onClick={() => setTable(true)}>
        {t('viz.show_table')}
      </button>
    </div>
  )
}

/**
 * Medidor de razão contra um limite. O trilho é um passo claro da MESMA rampa,
 * para o estado ser legível ao longo da barra inteira, não só no preenchido.
 */
export function Meter({ value, max, label, tone = 3 }: {
  value: number
  max: number
  label?: string
  tone?: 1 | 2 | 3 | 4 | 5
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="meter" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className="meter__track">
        <div className={`meter__fill meter__fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
      {label && <span className="mono muted">{label}</span>}
    </div>
  )
}

/** Sparkline de apoio dentro de um stat tile. Sem eixo, sem rótulo, sem hover. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const path = values
    .map((value, i) => {
      const px = (i / (values.length - 1)) * 100
      const py = 20 - ((value - min) / span) * 18
      return `${i === 0 ? 'M' : 'L'} ${px} ${py}`
    })
    .join(' ')

  return (
    <svg viewBox="0 0 100 22" className="spark" preserveAspectRatio="none" aria-hidden="true">
      <path d={path} className="spark__line" />
    </svg>
  )
}
