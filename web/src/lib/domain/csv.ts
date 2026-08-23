/**
 * Export em uma linha por série, como pedido. CSV é o formato que abre em
 * qualquer planilha sem intermediário — e o usuário precisa conseguir levar o
 * histórico embora sem depender do app.
 */

export type CsvValue = string | number | boolean | null | undefined

/**
 * Campo entre aspas quando contém separador, aspas ou quebra de linha; aspas
 * internas dobradas. É o RFC 4180, e é o que o Excel espera.
 */
function escapeField(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(escapeField).join(',')]
  for (const row of rows) lines.push(row.map(escapeField).join(','))
  // CRLF pelo mesmo motivo: é o que o RFC pede e o que o Excel lê sem tropeço.
  return lines.join('\r\n')
}

export const SET_LOG_HEADERS = [
  'sessao_id', 'data', 'ciclo', 'bloco', 'treino', 'status_sessao',
  'exercicio', 'equipamento', 'serie', 'aquecimento', 'lado',
  // `carga_por_lado` acompanha `carga_kg` porque o número sozinho é ambíguo
  // em máquina articulada: 40 pode ser 40 ou 80 no total.
  'carga_kg', 'carga_por_lado', 'placa', 'reps', 'segundos', 'rir', 'pulada', 'dor', 'concluida_em',
]

/**
 * BOM na frente: sem ele o Excel no Windows lê UTF-8 como latin-1 e todo
 * acento vira lixo — exatamente o mojibake que corrigimos no catálogo.
 */
export function csvBlob(content: string): Blob {
  return new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8' })
}
