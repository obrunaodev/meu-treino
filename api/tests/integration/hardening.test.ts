import { describe, expect, it } from 'vitest'

/**
 * Cabeçalhos e limite de taxa.
 *
 * O limitador precisa de duas propriedades ao mesmo tempo: barrar quem martela
 * o bypass de autenticação, e NÃO atrapalhar quem acerta. A segunda não é
 * detalhe — um teto que conta acerto quebra a própria suíte de integração, que
 * loga de propósito várias vezes por rodada.
 */

const API = process.env.API_URL ?? 'http://localhost:3000'
const TOKEN = process.env.DEV_LOGIN_TOKEN ?? ''

const up = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false)
const config = up
  ? ((await fetch(`${API}/auth/config`).then((r) => r.json())) as { devLogin: boolean })
  : { devLogin: false }

const suite = up ? describe : describe.skip

const devLogin = (token: string, email: string) =>
  fetch(`${API}/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, email }),
  })

suite('cabeçalhos defensivos', () => {
  it('não anuncia o stack', async () => {
    const res = await fetch(`${API}/health`)
    expect(res.headers.get('x-powered-by')).toBeNull()
  })

  it('manda os cabeçalhos que impedem sniffing e enquadramento', async () => {
    const res = await fetch(`${API}/health`)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
  })
})

// Sem o recurso ligado a rota devolve 403 e o teste não diria nada.
const limite = up && config.devLogin && TOKEN ? describe : describe.skip

/**
 * Aqui só se prova a FIAÇÃO — que o limitador está montado nesta rota.
 *
 * O comportamento dele é coberto em tests/rate-limit.test.ts, direto no
 * middleware. Provar aqui esgotando a cota seria pior que inútil: o balde é
 * por IP e vive no processo, então a rodada seguinte da suíte começaria
 * bloqueada. É para isso que o limitador anuncia o orçamento em cabeçalho —
 * dá para verificar que ele está lá sem gastar nada dele.
 */
limite('o limitador está montado nas rotas sensíveis', () => {
  it('o login provisório anuncia o orçamento restante', async () => {
    const res = await devLogin(TOKEN, `rl-${Date.now()}@exemplo.com`)

    expect(res.status).toBe(200)
    expect(res.headers.get('ratelimit-limit')).toBe('30')
    expect(Number(res.headers.get('ratelimit-remaining'))).toBeGreaterThan(0)
    expect(Number(res.headers.get('ratelimit-reset'))).toBeGreaterThan(0)
  })

  it('acertar o token não gasta cota', async () => {
    const antes = await devLogin(TOKEN, `rl-a-${Date.now()}@exemplo.com`)
    const depois = await devLogin(TOKEN, `rl-b-${Date.now()}@exemplo.com`)

    expect(depois.headers.get('ratelimit-remaining'))
      .toBe(antes.headers.get('ratelimit-remaining'))
  })

  it('as rotas sem teto não anunciam orçamento nenhum', async () => {
    // O sync fica de fora de propósito; ver o comentário em app.ts.
    const res = await fetch(`${API}/api/sync`, { method: 'POST' })
    expect(res.headers.get('ratelimit-limit')).toBeNull()
  })
})
