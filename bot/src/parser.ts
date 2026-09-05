export interface ExerciseEntry {
  exerciseNumber: number
  weightKg: number
  sets: number
  reps: number
  rir: number
}

export type ParseResult =
  | { ok: true; value: ExerciseEntry }
  | { ok: false; reason: 'exercise' | 'weight' | 'sets_reps' | 'rir' | 'weight_range' | 'sets_range' }

/**
 * Faixas de sanidade do registro.
 *
 * `weight_kg` é `numeric(7,2)`: acima de 99999.99 o INSERT estoura e a exceção
 * sobe até o handler de mensagens, que só loga — o usuário fica sem resposta
 * nenhuma, que é o pior desfecho possível para um erro de digitação. O teto
 * aqui é bem menor que o da coluna porque o objetivo é pegar o zero a mais.
 */
const MAX_WEIGHT_KG = 999
/** Cada série vira um INSERT; 20 já é mais do que qualquer treino real pede. */
const MAX_SETS = 20

export type BotCommand = 'start' | 'edit' | 'end' | 'help' | 'clear' | 'history' | 'today' | 'skip' | 'last'

const commandAliases: Record<BotCommand, string[]> = {
  start: ['start', 'init', 'iniciar', 'inicio', 'ini', 'comecar', 'comeco'],
  edit: ['edit', 'editar', 'edita', 'corrigir', 'corrige'],
  end: ['end', 'fim', 'final', 'finalizar', 'encerrar', 'encerra'],
  help: ['help', 'ajuda', 'ajudar', 'comandos', 'socorro'],
  clear: ['clear', 'clean', 'limpar', 'limpa', 'limpeza', 'apagar'],
  history: ['history', 'historico', 'hist', 'semana', 'treinos'],
  today: ['today', 'hoje', 'agora', 'previa', 'proximo'],
  skip: ['skip', 'pular', 'pula', 'ignorar', 'ignora'],
  last: ['last', 'ultimo', 'ultima', 'anterior', 'recente'],
}

/** Converte aliases e pequenos erros de digitação em um comando canônico. */
export function parseBotCommand(input: string): { command: BotCommand; args: string } | null {
  const match = input.trim().match(/^\/([^\s]+)(?:\s+(.+))?$/u)
  if (!match) return null
  const token = normalizeWord(match[1]!)
  for (const command of ['start', 'edit', 'end', 'help', 'clear', 'history', 'today', 'skip', 'last'] as const) {
    if (matchesAlias(token, commandAliases[command])) return { command, args: match[2]?.trim() ?? '' }
  }
  return null
}

/** Detecta o modificador opcional que inclui links de execução. */
export function hasLinkOption(args: string) {
  return args.split(/\s+/).some((part) => {
    const token = normalizeWord(part.replace(/^-+/, ''))
    return token === 'l' || matchesAlias(token, ['link', 'links'])
  })
}

/** Reconhece o comando de pular associado ao número da lista. */
export function parseSkipEntry(input: string): number | null {
  const normalized = input.trim()
  const before = normalized.match(/^\/([^\s]+)\s+(\d{1,3})$/u)
  return before && matchesAlias(normalizeWord(before[1]!), commandAliases.skip) ? Number(before[2]) : null
}

/** Interpreta a correção no formato exercício, carga, repetições×séries e esforço. */
export function parseEditEntry(input: string): ParseResult {
  return parseExerciseEntry(input)
}

/** Interpreta o registro tolerando ordem, espaços, abreviações e separadores. */
export function parseExerciseEntry(input: string): ParseResult {
  const normalized = input.toLowerCase().replace(/×|\*/g, 'x').replace(/,/g, '.').trim()
  const weight = matchWeight(normalized)
  if (!weight) return { ok: false, reason: 'weight' }

  const setReps = normalized.match(/\b(\d{1,2})\s*[x\-/]\s*(\d{1,3})\b/)
  if (!setReps) return { ok: false, reason: 'sets_reps' }

  const rir = matchRir(normalized)
  if (!rir) return { ok: false, reason: 'rir' }

  const withoutKnown = normalized
    .replace(weight.match, ' ')
    .replace(setReps[0], ' ')
    .replace(rir.match, ' ')
  const exercise = withoutKnown.match(/\b(\d{1,3})\b/)
  if (!exercise) return { ok: false, reason: 'exercise' }

  const rawWeight = Number(weight.values[0])
  const unit = weight.values[1]
  const weightKg = unit.startsWith('lb') ? rawWeight / 2.2046226218 : rawWeight
  const sets = Number(setReps[1])

  // Faixa antes do banco: um zero a mais aqui virava 500 e silêncio no grupo.
  if (weightKg > MAX_WEIGHT_KG) return { ok: false, reason: 'weight_range' }
  if (sets < 1 || sets > MAX_SETS) return { ok: false, reason: 'sets_range' }

  return {
    ok: true,
    value: {
      exerciseNumber: Number(exercise[1]),
      weightKg,
      sets,
      reps: Number(setReps[2]),
      rir: rir.value,
    },
  }
}

function matchRir(input: string): { match: string; value: number } | null {
  const numeric = matchPair(input, /\b(\d{1,2})\s*(?:rir|ri|r)\b/, /(?<!\d)\b(?:rir|ri|r)\s*(\d{1,2})\b/)
  if (numeric) return { match: numeric.match, value: Number(numeric.values[0]) }

  const normalized = normalizeWord(input)
  const phrases: Array<{ pattern: RegExp; value: number }> = [
    { pattern: /\b(?:muito\s+pesad[oa]?|mt\s+pesad[oa]?|very\s+heavy)\b/, value: 0 },
    { pattern: /\b(?:moderad[oa]?|moderate|mod)\b/, value: 2 },
    { pattern: /\b(?:pesad[oa]?|heavy)\b/, value: 1 },
    { pattern: /\b(?:leve|light)\b/, value: 4 },
  ]
  for (const phrase of phrases) {
    const match = normalized.match(phrase.pattern)
    if (match) return { match: input.slice(match.index!, match.index! + match[0].length), value: phrase.value }
  }

  const words = [...normalized.matchAll(/\b[a-z]{3,10}\b/g)]
  const aliases = [
    { words: ['moderado', 'moderada', 'moderate'], value: 2 },
    { words: ['pesado', 'pesada', 'heavy'], value: 1 },
    { words: ['leve', 'light'], value: 4 },
  ]
  for (const word of words) {
    const effort = aliases.find((candidate) => matchesAlias(word[0], candidate.words))
    if (effort) return { match: input.slice(word.index!, word.index! + word[0].length), value: effort.value }
  }
  return null
}

function matchWeight(input: string) {
  const patterns = [
    { regex: /(?<![\d.])\b([a-z]{1,6})\s*(\d+(?:\.\d+)?)\b/g, reversed: true },
    { regex: /\b(\d+(?:\.\d+)?)\s*([a-z]{1,6})\b/g, reversed: false },
  ]
  for (const pattern of patterns) {
    for (const match of input.matchAll(pattern.regex)) {
      const unit = canonicalUnit(pattern.reversed ? match[1]! : match[2]!)
      if (!unit) continue
      const value = pattern.reversed ? match[2]! : match[1]!
      return { match: match[0], values: [value, unit] }
    }
  }
  return null
}

function canonicalUnit(input: string): 'kg' | 'lb' | null {
  if (input === 'k') return 'kg'
  if (input === 'l') return 'lb'
  const candidates: Array<{ value: string; unit: 'kg' | 'lb' }> = [
    { value: 'kg', unit: 'kg' }, { value: 'kgs', unit: 'kg' },
    { value: 'kilo', unit: 'kg' }, { value: 'kilos', unit: 'kg' },
    { value: 'lb', unit: 'lb' }, { value: 'lbs', unit: 'lb' },
  ]
  return candidates.find((candidate) => editDistance(input, candidate.value) <= 1)?.unit ?? null
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return row[b.length]!
}

function normalizeWord(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function matchesAlias(value: string, aliases: string[]) {
  return aliases.some((alias) => value === alias || (value.length >= 3 && (editDistance(value, alias) <= 1 || adjacentSwap(value, alias))))
}

function adjacentSwap(value: string, alias: string) {
  if (value.length !== alias.length) return false
  for (let index = 0; index < value.length - 1; index++) {
    if (value[index] !== alias[index + 1] || value[index + 1] !== alias[index]) continue
    return value.slice(0, index) === alias.slice(0, index) && value.slice(index + 2) === alias.slice(index + 2)
  }
  return false
}

function matchPair(input: string, normal: RegExp, reversed: RegExp) {
  const second = input.match(reversed)
  if (second) return { match: second[0], values: [second[2] ?? second[1]!, second[1]!] }
  const first = input.match(normal)
  return first ? { match: first[0], values: [first[1]!, first[2]!] } : null
}
