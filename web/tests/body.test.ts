import { describe, expect, it } from 'vitest'
import {
  MEASUREMENT_KINDS, latestPerDay, measurementKind, measurementSeries, measurementSummary,
  toCanonical, toDisplay, unitLabel, type MeasurementRow,
} from '../src/lib/domain/body'

const row = (patch: Partial<MeasurementRow> & { measuredOn: string }): MeasurementRow => ({
  id: patch.measuredOn + (patch.side ?? '') + (patch.updatedAt ?? ''),
  kind: 'peso', side: 'ambos', value: 80, updatedAt: '2026-09-15T10:00:00.000Z', ...patch,
})

describe('unidades', () => {
  it('percentual não converte nunca', () => {
    expect(toDisplay(18.5, 'percent', 'lb')).toBe(18.5)
    expect(unitLabel('percent', 'lb')).toBe('%')
  })

  it('comprimento acompanha a preferência de carga', () => {
    expect(unitLabel('length', 'kg')).toBe('cm')
    expect(unitLabel('length', 'lb')).toBe('in')
    expect(toDisplay(101.6, 'length', 'lb')).toBe(40)
    expect(toCanonical(40, 'length', 'lb')).toBe(101.6)
  })

  it('ida e volta não muda o valor guardado', () => {
    for (const preference of ['kg', 'lb'] as const) {
      expect(toCanonical(toDisplay(82.4, 'mass', preference), 'mass', preference)).toBe(82.4)
    }
  })

  it('todo tipo declarado tem unidade e é encontrável pelo slug', () => {
    for (const kind of MEASUREMENT_KINDS) {
      expect(measurementKind(kind.slug)).toEqual(kind)
    }
    expect(measurementKind('inexistente')).toBeNull()
  })
})

describe('latestPerDay', () => {
  it('dois aparelhos gravando o mesmo dia: fica a gravação mais recente', () => {
    const rows = [
      row({ measuredOn: '2026-09-15', value: 80, updatedAt: '2026-09-15T10:00:00.000Z' }),
      row({ measuredOn: '2026-09-15', value: 81, updatedAt: '2026-09-15T18:00:00.000Z' }),
    ]
    expect(latestPerDay(rows).map((entry) => entry.value)).toEqual([81])
  })

  it('lados diferentes no mesmo dia não são duplicata', () => {
    const rows = [
      row({ measuredOn: '2026-09-15', kind: 'coxa', side: 'D', value: 58 }),
      row({ measuredOn: '2026-09-15', kind: 'coxa', side: 'E', value: 57.5 }),
    ]
    expect(latestPerDay(rows)).toHaveLength(2)
  })

  it('devolve em ordem de dia, não de gravação', () => {
    const rows = [
      row({ measuredOn: '2026-09-20', updatedAt: '2026-09-20T10:00:00.000Z' }),
      row({ measuredOn: '2026-09-10', updatedAt: '2026-09-21T10:00:00.000Z' }),
    ]
    expect(latestPerDay(rows).map((entry) => entry.measuredOn)).toEqual(['2026-09-10', '2026-09-20'])
  })
})

describe('série e resumo', () => {
  const rows = [
    row({ measuredOn: '2026-09-01', value: 84 }),
    row({ measuredOn: '2026-09-08', value: 83.2 }),
    row({ measuredOn: '2026-09-15', value: 82.4 }),
    row({ measuredOn: '2026-09-15', kind: 'cintura', value: 90 }),
  ]

  it('a série é de um tipo e um lado só', () => {
    expect(measurementSeries(rows, 'peso')).toEqual([
      { day: '2026-09-01', value: 84 },
      { day: '2026-09-08', value: 83.2 },
      { day: '2026-09-15', value: 82.4 },
    ])
  })

  it('o resumo compara com a medida anterior, não com a primeira', () => {
    expect(measurementSummary(measurementSeries(rows, 'peso'))).toMatchObject({
      latest: { day: '2026-09-15', value: 82.4 },
      previous: { day: '2026-09-08', value: 83.2 },
      delta: -0.8,
    })
  })

  it('a primeira medida não inventa variação', () => {
    expect(measurementSummary(measurementSeries(rows, 'cintura'))).toMatchObject({ previous: null, delta: null })
    expect(measurementSummary([])).toBeNull()
  })
})
