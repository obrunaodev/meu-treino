import { describe, expect, it } from 'vitest'
import {
  formatLoad, kgForPlate, kgToLb, lbToKg, nextLoadStep, plateForKg, workVolume, workingSetCount,
} from '../src/lib/domain/load'

// Coluna real de máquina de pino: os saltos NÃO são constantes.
const pino = { loadType: 'pino', plateTable: [10, 15, 22, 30, 38, 45], incrementKg: null }
const anilha = { loadType: 'anilha', plateTable: [], incrementKg: 5 }
const livre = { loadType: 'livre', plateTable: [], incrementKg: null }

describe('kgForPlate', () => {
  it('lê o peso da posição pela tabela, 1-indexado como na máquina', () => {
    expect(kgForPlate(pino, 1)).toBe(10)
    expect(kgForPlate(pino, 3)).toBe(22)
  })

  it('não inventa peso acima da última placa', () => {
    expect(kgForPlate(pino, 7)).toBeNull()
  })

  it('rejeita posição inválida', () => {
    expect(kgForPlate(pino, 0)).toBeNull()
  })

  it('sem tabela, só responde se a máquina for linear', () => {
    expect(kgForPlate(anilha, 3)).toBe(15)
    expect(kgForPlate(livre, 3)).toBeNull()
  })
})

describe('plateForKg', () => {
  it('acha a posição mais próxima, não a de baixo', () => {
    expect(plateForKg(pino, 21)).toBe(3)
    expect(plateForKg(pino, 26)).toBe(3)
    expect(plateForKg(pino, 27)).toBe(4)
  })

  it('nunca devolve posição zero', () => {
    expect(plateForKg(pino, 0)).toBe(1)
    expect(plateForKg(anilha, 0)).toBe(1)
  })
})

describe('nextLoadStep', () => {
  it('em pino, subir vai para a próxima placa e o salto em kg varia', () => {
    expect(nextLoadStep(pino, { plate: 2, kg: 15 }, 1)).toEqual({ plate: 3, kg: 22 })
    expect(nextLoadStep(pino, { plate: 3, kg: 22 }, 1)).toEqual({ plate: 4, kg: 30 })
  })

  it('não passa da última placa nem desce abaixo da primeira', () => {
    expect(nextLoadStep(pino, { plate: 6, kg: 45 }, 1)).toEqual({ plate: 6, kg: 45 })
    expect(nextLoadStep(pino, { plate: 1, kg: 10 }, -1)).toEqual({ plate: 1, kg: 10 })
  })

  it('deriva a placa do kg quando ela não veio preenchida', () => {
    expect(nextLoadStep(pino, { plate: null, kg: 22 }, 1)).toEqual({ plate: 4, kg: 30 })
  })

  it('em anilha usa o incremento declarado', () => {
    expect(nextLoadStep(anilha, { plate: null, kg: 20 }, 1)).toEqual({ plate: null, kg: 25 })
  })

  it('em peso livre sem incremento, cai em 2.5 kg', () => {
    expect(nextLoadStep(livre, { plate: null, kg: 20 }, 1)).toEqual({ plate: null, kg: 22.5 })
  })

  it('nunca deixa a carga ficar negativa', () => {
    expect(nextLoadStep(livre, { plate: null, kg: 1 }, -1)).toEqual({ plate: null, kg: 0 })
  })
})

describe('conversão de unidade', () => {
  it('kg e lb usam o fator real, não aproximação', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 3)
    expect(lbToKg(220.462)).toBeCloseTo(100, 3)
  })

  it('ida e volta preserva o valor', () => {
    expect(lbToKg(kgToLb(60))).toBeCloseTo(60, 10)
  })
})

describe('formatLoad', () => {
  it('omite decimal quando o peso é inteiro', () => {
    expect(formatLoad(60, null, 'kg', false)).toBe('60 kg')
  })

  it('mostra a placa quando o usuário pediu', () => {
    expect(formatLoad(22, 3, 'kg', true)).toBe('22 kg · p3')
    expect(formatLoad(22, 3, 'kg', false)).toBe('22 kg')
  })

  it('converte para lb quando essa é a unidade', () => {
    expect(formatLoad(100, null, 'lb', false)).toBe('220.5 lb')
  })

  it('sem carga registrada, mostra travessão', () => {
    expect(formatLoad(null, null, 'kg', true)).toBe('—')
  })

  it('marca a carga por lado quando o rótulo é passado', () => {
    expect(formatLoad(40, null, 'kg', false, 'lado')).toBe('40 kg/lado')
  })

  it('a marca de lado convive com a placa', () => {
    expect(formatLoad(22, 3, 'kg', true, 'side')).toBe('22 kg/side · p3')
  })

  it('sem rótulo, nada muda — é o caso da máquina comum', () => {
    expect(formatLoad(40, null, 'kg', false, null)).toBe(formatLoad(40, null, 'kg', false))
  })

  it('sem carga, a marca de lado não inventa nada para mostrar', () => {
    expect(formatLoad(null, null, 'kg', false, 'lado')).toBe('—')
  })
})

describe('volume', () => {
  const sets = [
    { isWarmup: true, weightKg: 20, reps: 10, skipped: false },
    { isWarmup: false, weightKg: 60, reps: 10, skipped: false },
    { isWarmup: false, weightKg: 60, reps: 8, skipped: false },
    { isWarmup: false, weightKg: 60, reps: 8, skipped: true },
  ]

  it('aquecimento fica fora do volume', () => {
    expect(workVolume(sets)).toBe(60 * 10 + 60 * 8)
  })

  it('série pulada não conta', () => {
    expect(workingSetCount(sets)).toBe(2)
  })
})
