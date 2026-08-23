/**
 * Regras de sessão compartilhadas entre API e cliente. Duplicar a constante nos
 * dois lados é como eles divergem — o cliente mostra a sessão viva enquanto o
 * servidor já a fechou.
 */

/** 6h sem nenhum registro fecham a sessão, marcada como incompleta. */
export const AUTO_CLOSE_AFTER_MS = 6 * 60 * 60 * 1000
