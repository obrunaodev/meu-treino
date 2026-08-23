/**
 * Política de reconexão e memória do eco das próprias mensagens.
 *
 * Fica separado do `manager` porque é lógica pura: dá para testar sem abrir
 * socket, e é justamente onde estavam os dois problemas — retentativa de 1,5 s
 * fixa, que numa recusa persistente vira laço quente, e um `Set` de ids que só
 * encolhia quando o eco correspondente chegava.
 */

/** Primeira espera. Uma queda de rede curta volta rápido. */
export const RECONNECT_BASE_MS = 1_500
/** Teto da espera. Além disso, insistir mais rápido não ajuda em nada. */
export const RECONNECT_MAX_MS = 60_000
/** Depois disto, para e espera ação humana em vez de martelar para sempre. */
export const RECONNECT_MAX_ATTEMPTS = 10

/**
 * Espera da enésima tentativa: dobra até o teto, com jitter de 50–100%.
 *
 * O jitter não é enfeite. Vários donos conectados caem juntos numa queda de
 * rede; sem ele, todos voltam no mesmo milissegundo e derrubam de novo.
 */
export function reconnectDelay(
  attempt: number,
  random: () => number = Math.random,
): number {
  const expoente = Math.min(attempt - 1, 31)
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** expoente)
  return Math.round(base * (0.5 + random() * 0.5))
}

/** Quanto tempo um id de mensagem enviada espera pelo eco antes de ser esquecido. */
export const SENT_TTL_MS = 5 * 60_000
/** Teto absoluto de ids lembrados, caso o eco pare de chegar. */
export const SENT_MAX = 500

/**
 * Ids que o próprio bot mandou, para não responder ao próprio eco.
 *
 * Era um `Set` que só perdia entrada quando o eco chegava — e quando ele não
 * chegava (socket caiu entre o envio e o retorno), o id ficava para sempre.
 */
export class SentMessages {
  private readonly ids = new Map<string, number>()

  constructor(
    private readonly ttlMs = SENT_TTL_MS,
    private readonly max = SENT_MAX,
  ) {}

  remember(id: string, now = Date.now()) {
    for (const [key, at] of this.ids) {
      if (now - at > this.ttlMs) this.ids.delete(key)
    }
    // Map preserva ordem de inserção: o primeiro é o mais antigo, e se ele
    // ainda está aqui com a fila cheia, o eco dele não vem mais.
    while (this.ids.size >= this.max) {
      const antigo = this.ids.keys().next().value
      if (antigo === undefined) break
      this.ids.delete(antigo)
    }
    this.ids.set(id, now)
  }

  /** True se era eco nosso — e consome o id, que não se repete. */
  consume(id: string): boolean {
    return this.ids.delete(id)
  }

  get size() {
    return this.ids.size
  }
}
