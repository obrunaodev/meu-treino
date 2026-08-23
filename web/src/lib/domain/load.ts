/**
 * Carga em máquina de pino é quase sempre NÃO-linear: a placa 5 não pesa cinco
 * vezes a placa 1. Por isso `plateTable` guarda os kg acumulados de cada
 * posição, na ordem física, e nada aqui deriva peso de um incremento fixo —
 * exceto quando o equipamento declara ser linear.
 */

export type LoadType = 'pino' | 'anilha' | 'livre' | 'corporal'
export type Unit = 'kg' | 'lb'

export interface LoadEquipment {
  loadType: string
  plateTable: number[]
  incrementKg: number | null
}

const LB_PER_KG = 2.2046226218

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG
}

/** Peso na posição de pino (1-indexado, como está escrito na máquina). */
export function kgForPlate(equipment: LoadEquipment, plate: number): number | null {
  if (plate < 1) return null

  if (equipment.plateTable.length > 0) {
    return equipment.plateTable[plate - 1] ?? null
  }
  // Sem tabela cadastrada, só dá para responder se a máquina for linear.
  if (equipment.incrementKg) return plate * equipment.incrementKg
  return null
}

/** Posição de pino mais próxima de um peso, para migrar carga entre máquinas. */
export function plateForKg(equipment: LoadEquipment, kg: number): number | null {
  if (equipment.plateTable.length === 0) {
    if (!equipment.incrementKg) return null
    return Math.max(1, Math.round(kg / equipment.incrementKg))
  }

  let best = 1
  let bestGap = Infinity
  equipment.plateTable.forEach((value, index) => {
    const gap = Math.abs(value - kg)
    if (gap < bestGap) {
      bestGap = gap
      best = index + 1
    }
  })
  return best
}

/**
 * O passo de incremento depende da máquina: em pino, subir é ir para a próxima
 * placa, e o salto em kg varia ao longo da coluna. Botão de "+" precisa saber
 * disso, senão sugere carga que a máquina não tem.
 */
export function nextLoadStep(
  equipment: LoadEquipment,
  current: { plate: number | null; kg: number | null },
  direction: 1 | -1,
): { plate: number | null; kg: number | null } {
  if (equipment.loadType === 'pino' && equipment.plateTable.length > 0) {
    const currentPlate = current.plate ?? plateForKg(equipment, current.kg ?? 0) ?? 1
    const plate = Math.min(equipment.plateTable.length, Math.max(1, currentPlate + direction))
    return { plate, kg: kgForPlate(equipment, plate) }
  }

  // Anilha e peso livre: incremento declarado, ou 2.5 kg — o menor par de
  // anilhas que existe na prática em qualquer academia.
  const step = equipment.incrementKg ?? 2.5
  const kg = Math.max(0, Number(((current.kg ?? 0) + step * direction).toFixed(2)))
  return { plate: null, kg }
}

/**
 * `perSideLabel` marca a carga de máquina articulada, onde a anilha entra dos
 * dois lados e o número registrado é o de um lado só — "40 kg" sem essa marca
 * não diz se foram 40 ou 80. A palavra vem de fora porque este módulo não
 * conhece idioma; quem chama passa a tradução, ou `null` quando não se aplica.
 */
export function formatLoad(
  weightKg: number | null,
  plate: number | null,
  unit: Unit,
  showPlates: boolean,
  perSideLabel: string | null = null,
): string {
  if (weightKg === null && plate === null) return '—'

  const parts: string[] = []
  if (weightKg !== null) {
    const value = unit === 'lb' ? kgToLb(weightKg) : weightKg
    // Sem decimal quando é inteiro: "60 kg" lê melhor que "60.0 kg".
    const load = `${Number(value.toFixed(1))} ${unit}`
    parts.push(perSideLabel ? `${load}/${perSideLabel}` : load)
  }
  if (showPlates && plate !== null) parts.push(`p${plate}`)

  return parts.join(' · ')
}

/**
 * Volume de trabalho: séries de aquecimento ficam de fora por decisão de
 * produto, e exercício por tempo não tem carga × reps que faça sentido somar.
 */
export function workVolume(
  sets: Array<{ isWarmup: boolean; weightKg: number | null; reps: number | null; skipped: boolean }>,
): number {
  return sets
    .filter((s) => !s.isWarmup && !s.skipped)
    .reduce((total, s) => total + (s.weightKg ?? 0) * (s.reps ?? 0), 0)
}

export function workingSetCount(sets: Array<{ isWarmup: boolean; skipped: boolean }>): number {
  return sets.filter((s) => !s.isWarmup && !s.skipped).length
}
