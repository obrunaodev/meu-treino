/**
 * Medidas corporais: o que se mede, em que unidade, e o que a tela lê.
 *
 * O banco guarda sempre a unidade canônica — kg, cm ou % —, e a conversão
 * acontece só na borda da tela. É a mesma regra da carga: histórico gravado em
 * lb mudaria de significado ao trocar a preferência.
 */

import { kgToLb, lbToKg } from './load.js'

export type MeasurementUnit = 'mass' | 'length' | 'percent'

export interface MeasurementKind {
  slug: string
  unit: MeasurementUnit
  /** Circunferência de membro tem lado; cintura e peso não têm. */
  sided: boolean
}

export const MEASUREMENT_KINDS: MeasurementKind[] = [
  { slug: 'peso', unit: 'mass', sided: false },
  { slug: 'gordura', unit: 'percent', sided: false },
  { slug: 'pescoco', unit: 'length', sided: false },
  { slug: 'peito', unit: 'length', sided: false },
  { slug: 'cintura', unit: 'length', sided: false },
  { slug: 'quadril', unit: 'length', sided: false },
  { slug: 'braco', unit: 'length', sided: true },
  { slug: 'antebraco', unit: 'length', sided: true },
  { slug: 'coxa', unit: 'length', sided: true },
  { slug: 'panturrilha', unit: 'length', sided: true },
]

const CM_PER_INCH = 2.54

export function measurementKind(slug: string): MeasurementKind | null {
  return MEASUREMENT_KINDS.find((kind) => kind.slug === slug) ?? null
}

/**
 * Comprimento em polegada acompanha a preferência de carga em lb.
 *
 * Uma preferência separada só para comprimento seria mais fiel a quem pesa em
 * kg e mede em polegada, mas é uma tela a mais para um caso que ninguém pediu.
 */
export function unitLabel(unit: MeasurementUnit, preference: 'kg' | 'lb'): string {
  if (unit === 'percent') return '%'
  if (unit === 'mass') return preference
  return preference === 'lb' ? 'in' : 'cm'
}

/** Do canônico para o que a tela mostra. */
export function toDisplay(value: number, unit: MeasurementUnit, preference: 'kg' | 'lb'): number {
  if (unit === 'percent' || preference === 'kg') return round(value)
  return round(unit === 'mass' ? kgToLb(value) : value / CM_PER_INCH)
}

/** Do que a tela mostra para o canônico. */
export function toCanonical(value: number, unit: MeasurementUnit, preference: 'kg' | 'lb'): number {
  if (unit === 'percent' || preference === 'kg') return round(value)
  return round(unit === 'mass' ? lbToKg(value) : value * CM_PER_INCH)
}

const round = (value: number) => Math.round(value * 10) / 10

export interface MeasurementRow {
  id: string
  kind: string
  side: string
  value: number
  measuredOn: string
  updatedAt: string
}

/**
 * Uma medida por dia, tipo e lado.
 *
 * Sem índice único no banco, dois aparelhos offline podem gravar o mesmo dia.
 * A leitura fica com a gravação mais recente — que é também o que faz uma
 * remedida do mesmo dia substituir a anterior na tela, sem apagar nada.
 */
export function latestPerDay<T extends MeasurementRow>(rows: T[]): T[] {
  const byDay = new Map<string, T>()
  for (const row of rows) {
    const key = `${row.measuredOn}|${row.kind}|${row.side}`
    const current = byDay.get(key)
    if (!current || current.updatedAt <= row.updatedAt) byDay.set(key, row)
  }
  return [...byDay.values()].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
}

export interface MeasurementSeries {
  day: string
  value: number
}

export function measurementSeries<T extends MeasurementRow>(rows: T[], kind: string, side = 'ambos'): MeasurementSeries[] {
  return latestPerDay(rows.filter((row) => row.kind === kind && row.side === side))
    .map((row) => ({ day: row.measuredOn, value: row.value }))
}

export interface MeasurementSummary {
  latest: MeasurementSeries
  previous: MeasurementSeries | null
  delta: number | null
}

/** O último valor e quanto ele andou desde a medida anterior. */
export function measurementSummary(series: MeasurementSeries[]): MeasurementSummary | null {
  const latest = series.at(-1)
  if (!latest) return null
  const previous = series.at(-2) ?? null
  return {
    latest,
    previous,
    delta: previous ? round(latest.value - previous.value) : null,
  }
}
