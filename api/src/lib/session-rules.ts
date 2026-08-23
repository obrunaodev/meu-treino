/**
 * Regras de sessão compartilhadas entre API e cliente. Duplicar a constante nos
 * dois lados é como eles divergem — o cliente mostra a sessão viva enquanto o
 * servidor já a fechou.
 */

/** 6h sem nenhum registro fecham a sessão, marcada como incompleta. */
export const AUTO_CLOSE_AFTER_MS = 6 * 60 * 60 * 1000

/**
 * Carência antes de apagar do bucket a mídia já removida.
 *
 * O aparelho que apagou a foto ainda tem a cópia dele; quem precisa da janela é
 * o aparelho que estava offline e ainda vai puxar a remoção. Sete dias cobrem
 * uma semana sem abrir o app sem deixar o lixo acumular.
 */
export const MEDIA_PURGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
