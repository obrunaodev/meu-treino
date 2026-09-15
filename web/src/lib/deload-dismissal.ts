import type { BlockPosition } from './domain/deload.js'

/**
 * "Agora não" do aviso de bloco, guardado por bloco fechado e por dispositivo.
 *
 * Não sincroniza: é um empurrão que expira sozinho na primeira sessão do bloco
 * novo, e uma coluna sincronizada custaria migration e merge por nada. O pior
 * caso é ver o aviso mais uma vez em outro aparelho.
 */
const key = (programId: string, block: BlockPosition) =>
  `treino:deload:${programId}:${block.periodNumber}:${block.blockNumber}`

export function isDeloadDismissed(programId: string, block: BlockPosition): boolean {
  try {
    return localStorage.getItem(key(programId, block)) !== null
  } catch {
    // Modo privado sem storage: o aviso aparece de novo, e só.
    return false
  }
}

export function dismissDeload(programId: string, block: BlockPosition): void {
  try {
    localStorage.setItem(key(programId, block), new Date().toISOString())
  } catch {
    // Sem storage o aviso volta no próximo carregamento; nada quebra.
  }
}
