const labels = ['Muito pesado', 'Pesado', 'Moderado', 'Leve'] as const

/** Exibe a escala verbal sem alterar o valor numérico persistido. */
export function rirLabelPt(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  if (value >= 4) return labels[3]
  if (value >= 2) return labels[2]
  if (value >= 1) return labels[1]
  return labels[0]
}
