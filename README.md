# Meu Treino

App de treino de força offline-first. Ciclo A/B/N com RIR alvo, registro série a
série, histórico de dor por região, marcador funcional e biblioteca de imagens
dos equipamentos.

## Stack

| Parte | Escolha |
|---|---|
| Web | React 19 + Vite + TS, PWA (service worker), Dexie/IndexedDB, i18next |
| API | Node 22 + Express 5 + TS, Drizzle ORM, zod, pino |
| WhatsApp | Baileys 6, serviço Node isolado, QR Code e chaves Signal no Postgres |
| Banco | Postgres 17 |
| Mídia | MinIO (S3), bucket **privado** — o stream passa pela API |
| Proxy | Caddy (TLS automático), só no perfil `prod` |

## Subir

```bash
cp .env.example .env          # ajuste as credenciais
docker compose up -d          # db, minio, api, web
docker compose exec api npm run db:migrate
docker compose exec api npm run catalog:import
```

- Web: http://localhost:5173
- API: http://localhost:3000
- MinIO console: http://localhost:9001

### WhatsApp pessoal

Gere um segredo interno diferente para produção e preencha
`WHATSAPP_INTERNAL_TOKEN`. O serviço não publica porta no host; somente a API
autenticada consegue alcançá-lo pela rede privada do Compose.

Na rota `/whatsapp`, conecte o aparelho pelo QR Code e escolha o único grupo em
que o bot pode agir. Mensagens de qualquer outro chat ou grupo são ignoradas.

- `/start` abre ou retoma o próximo treino do ciclo e envia a lista numerada;
- cada item mostra a maior carga da exposição anterior e o vídeo em português
  do catálogo (com fallback para inglês);
- `1 100kg 3x15 1rir` registra três séries do exercício 1;
- `k`, `kgs`, `lb`, ordem diferente e separadores `x`, `-` ou `/` são aceitos;
- quando todos os exercícios são registrados, a sessão é concluída.

Credenciais e chaves Signal ficam em `whatsapp_auth_state` e
`whatsapp_auth_keys`. Não são expostas ao browser nem guardadas em volume de
arquivos. Baileys é uma biblioteca não oficial; o vínculo pode exigir nova
leitura do QR se o WhatsApp alterar o protocolo ou revogar o aparelho.

### Login com Google

Em `console.cloud.google.com` crie um OAuth client do tipo *Web application* com
redirect `http://localhost:3000/auth/google/callback`, e preencha
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` no `.env`.

`localhost` é secure context, então service worker, Web Push e OAuth funcionam
em dev sem domínio nem HTTPS. O Caddy só entra quando houver domínio:
`docker compose --profile prod up -d`.

### Login provisório (sem o Google)

Enquanto o OAuth do Google não estiver configurado:

```bash
openssl rand -base64 32     # cole em DEV_LOGIN_TOKEN
# no .env:
DEV_LOGIN_ENABLED=true
DEV_LOGIN_TOKEN=<o token gerado>
```

A tela de login passa a mostrar um formulário de e-mail + token. Qualquer
e-mail cria ou reabre uma conta, com `google_sub` prefixado por `dev:`.

**Isto é um bypass de autenticação.** Quem tiver o token entra como qualquer
usuário. As defesas são:

- desligado por padrão (`DEV_LOGIN_ENABLED=false`);
- a API **se recusa a subir** com `ENABLED=true` e token menor que 32 caracteres;
- a API **se recusa a subir** em produção com o bypass ligado, a menos que
  `DEV_LOGIN_ALLOW_IN_PRODUCTION=true` assuma a escolha por escrito;
- limite de taxa na rota, contando só tentativa errada — quem acerta o token
  não é atacante, e contar acerto quebraria a própria suíte;
- comparação do token em tempo constante;
- aviso em `WARN` a cada boot, e a cada sessão emitida;
- o formulário só aparece se `/auth/config` declarar o recurso ativo.

Para remover de vez depois do Google: apague a rota `/auth/dev-login` em
`api/src/routes/auth.ts` e o `DevLoginForm` em `web/src/pages/Login.tsx`.
Nenhuma outra parte do sistema depende deles — a sessão é emitida pelo mesmo
`issueSession` que o fluxo do Google usa.

Contas provisórias saem com:

```sql
delete from users where google_sub like 'dev:%';
```

## Testes

```bash
cd api && npm test                   # unitários: merge de três pontas, magic bytes
cd api && npm run test:integration   # exige o stack no ar; pula sozinho se não estiver
cd web && npm test                   # domínio: ciclo, carga/placas, sessão, CSV, outbox
cd web && npm run test:e2e           # jornada completa no navegador (Playwright)
cd bot && npm test                    # parser tolerante dos comandos do WhatsApp
```

**269 testes**: 35 unitários na API, 47 de integração contra Postgres real, 126
no web, 37 do bot e 24 de jornada no navegador.

O e2e roda contra o stack do compose já no ar e precisa de `DEV_LOGIN_TOKEN` no
ambiente. Ele percorre login → onboarding → catálogo → editor de treino →
sessão ao vivo → recarregar a página no meio → cardio → histórico → CSV, e
termina exigindo que o outbox **drene**: a UI é local-first e mostraria tudo
certo mesmo com a fila travada, então só a fila vazia prova que o servidor
recebeu.

Os testes do login provisório precisam de `DEV_LOGIN_TOKEN` no ambiente e
pulam sozinhos se `/auth/config` disser que o recurso está desligado.

## Arquitetura

### Offline-first

O IndexedDB é a fonte de verdade da UI — nada na tela lê da rede direto. Toda
mutação passa por `web/src/lib/outbox.ts`, que grava no store local e enfileira
a operação na mesma transação.

- **Ids gerados no cliente** (UUIDv7): um registro criado offline não muda de
  identidade ao subir, então referências feitas sem rede sobrevivem ao sync.
- **Cursor por `rev`**, uma sequence global no Postgres reatribuída por trigger
  em todo UPDATE. O pull é "me dê tudo acima deste rev" — sem depender de
  relógio, que entre dispositivos não é confiável. O cursor é **por entidade**:
  o pull pagina cada tabela em separado, e um cursor único avançaria por cima
  do que ficou fora da página de uma delas.
- **Soft delete** obrigatório: hard delete é invisível para um cliente offline,
  a linha só some do pull e ele nunca sabe que sumiu.

### Conflitos

Merge de três pontas campo a campo (`api/src/lib/merge.ts`). Um campo só vira
conflito manual quando os **dois** lados o alteraram para valores diferentes; o
resto é aplicado, então o usuário nunca perde trabalho enquanto decide.

Por entidade (`api/src/db/sync-tables.ts`):

- `append-only` — mídia, eventos de dor, resultados de teste. A linha nunca é
  editada depois de criada, a união entre dispositivos é sempre correta. Só vale
  para o que a UI de fato não deixa editar: um upsert em linha existente é
  descartado em silêncio, e marcar aqui algo editável perde a edição sem erro.
- `field-merge` — equipamentos, exercícios, templates, sessões e séries.
- `lww` — configurações do usuário.

Delete de um lado, edit do outro: **o edit ressuscita**. Apagar é barato de
refazer, recuperar uma edição perdida é impossível.

O que sobra aparece em um toast vermelho persistente
(`web/src/components/SyncBar.tsx`) e numa tela em Configurações.

### Mídia

Upload passa pela API, que valida o tipo pelos **magic bytes** (o content-type
do multipart vem do cliente e não vale nada), reencoda para WebP e gera thumb de
640px com `sharp` — resolução alta o bastante para a biblioteca não ficar
borrada no desktop. O bucket é privado e sem rota pública: o browser nunca fala
com o MinIO. O custo é o stream pelo Node, então `ETag` + `Cache-Control:
immutable` + `Range` fazem o trabalho pesado, e o service worker cacheia para a
academia sem sinal — em runtime (`CacheFirst` em `/api/media/*`), não no
precache do build, que só cobre js, css, fontes e ícones. O teto de 5 MB não protege a memória — quem aloca é o raster
decodificado —, então há um limite separado de 40 MP: um PNG uniforme de
16000×16000 cabe em 0,74 MB e viraria ~0,95 GB ao abrir.

Apagar a mídia é soft delete, para o cliente offline aprender que ela sumiu. Os
dois WebP saem do bucket sete dias depois, por `purgeDeletedMedia`; sem isso o
disco enche com foto que ninguém mais consegue ver.

### Catálogo

`catalogo-enriquecido.json` (295 exercícios, 40 estações, 17 grupos) é global e
só-leitura; o usuário copia e ajusta. O importador
(`api/scripts/import-catalog.ts`) trata duas coisas da origem:

**Mojibake.** 206 das 295 descrições em pt e 4 nomes vieram com UTF-8 lido como
latin-1 (`"deixe os pÃ©s"`). O import reverte — verificado: 0 restantes.

**Substituição por dor.** O campo bruto `exercicio_exclusao` guarda o exercício
*substituto* quando a dor está presente, não algo a evitar. A qualidade não é
uniforme, e o import faz triagem em `catalog_pain_swaps.status`:

| Dor | ok | inválido | pendente |
|---|---|---|---|
| ombro | 49 | 0 | 0 |
| lombar | 36 | 1 | 0 |
| joelho | 5 | 20 | 0 |
| quadril | 3 | 9 | 2 |

Joelho e quadril estão quebrados na origem: 12 apontam para o id 41, que não
existe no catálogo, e outros apontam para exercícios contraindicados para a
**mesma** dor (ex. `AGACHAMENTO NA BARRA GUIADA`, alvo de 6 casos de joelho, é
ele próprio contraindicado para joelho). O app só oferece automaticamente o que
tem `status = 'ok'`; o resto espera curadoria.

## Notas de operação

A VPS alvo tem 1 GB. Os limites do Compose são tetos, não reservas, mas a soma
agora ultrapassa 1 GB com API, web e bot; o consumo ocioso precisa ser medido
depois de conectar o WhatsApp. Antes de ir para produção: 2 GB de swap, buildar as imagens fora da VPS
(build no host dá OOM), e conferir se a região tem Ampere A1 no Always Free
(4 OCPU / 24 GB), que resolveria o problema de vez sem custo.

### Sessão ao vivo

Nenhuma fase guarda contador regressivo: tudo deriva de um instante absoluto.
O usuário troca para o Spotify, o navegador descarta o timer, ele volta — e o
tempo continua certo. A fase em si (`preparação / exercícios / descanso /
cardio`) vive em `localStorage` por sessão, com leitura síncrona para a primeira
renderização já sair certa; recarregar a página no meio do treino não devolve
ninguém para o cronômetro de preparação.

Séries de aquecimento são registradas com `is_warmup` e ficam fora do volume e
dos gráficos. Exercício pulado é gravado como pulado, não some — vira
informação de aderência. A sessão só é `concluida` se todo item foi resolvido;
sair no meio é `incompleta`, e é isso que o calendário desenha diferente.

### Editar o que já aconteceu

Todo dia do calendário abre `/historico/:id`, onde a sessão é corrigida: status,
data, anotações, cada série (carga, reps, RIR, lado, aquecimento, pulada),
o cardio e os registros de dor — com adicionar e apagar em cada um.

Duas decisões de domínio sustentam isso:

- **Ciclo e bloco são derivados na leitura**, não os gravados na sessão. Apagar
  uma sessão do meio deixaria buracos na numeração, e o gráfico de volume
  agrupa por ciclo. Derivar mantém tudo coerente sem reescrever histórico: a
  sessão apagada simplesmente não aconteceu, e as seguintes ocupam o lugar dela
  (`assignCycleNumbers` em `web/src/lib/domain/cycle.ts`).
- **Apagar uma sessão leva junto séries, cardio e dor.** Sem a cascata esses
  registros continuariam vivos, aparecendo no export CSV e no volume por ciclo,
  presos a uma sessão que não existe mais.

### Sistema visual

O contrato visual está em `docs/design-system.md`. Para agentes e pessoas, o
`AGENTS.md` define como localizar e validar esse contrato; `web/src/styles.css`
e `web/src/components/ui.tsx` são sua implementação executável. O webapp é
**tema escuro**; o claro existe como variante em Configurações.

| Papel | Valor |
|---|---|
| fundo do app | `#16150f` |
| cartão | `#1c1a15` |
| borda | `#2b2820` · chip `#3b382f` |
| texto | `#f2efe8` → `#c2bcae` → `#8f8a7d` → `#6d685c` |
| acento | `#b23a26` |
| concluído | `#7f9a6a` |

Barra lateral de 232px no desktop; no mobile, quatro abas curtas
(Hoje · Progresso · Treinos · Mais) com as telas secundárias em `/mais`, como
no frame de 420px. Botão primário é pílula (`999px`, 11×22, 14px/600), cartão
tem raio 14px e padding 20px, rótulo de seção em IBM Plex Mono 11px com
`letter-spacing: 0.16em`.

As três fontes do sistema (Barlow Condensed, IBM Plex Sans, IBM Plex Mono) são
empacotadas via `@fontsource`, só nos pesos usados e só nos subconjuntos
latinos — o pacote completo traz cirílico, grego e vietnamita e triplicaria o
precache de um app que fala pt-BR e en-US.

Os nomes do catálogo chegam em caixa alta na origem (`LEG PRESS HORIZONTAL`) e
o importador os converte para sentença, conforme o padrão visual.

### Gráficos

SVG inline, sem biblioteca. Todos de série única, então não há legenda — o
título já diz o que está plotado. Barras seguem a **ênfase** do sistema: contexto
em `#3b382f`, a última em `#b23a26`. Esse acento fica em 2.92:1 sobre o cartão,
logo abaixo do piso de 3:1 para marcas — mantido como acento de marca, com
o canal de alívio que a regra exige: rótulo direto no valor em destaque e
alternativa em tabela em todo gráfico. A rampa sequencial da dor foi validada com
`validate_palette.js --ordinal` nos dois modos (L monotônica, ΔL adjacente
≥ 0.06, ponta clara ≥ 2:1 contra a superfície, hue spread 6°). Cada gráfico tem
alternativa em tabela, e o modo escuro tem passos próprios, não uma inversão.

## Pendências conhecidas

- Curadoria das substituições de joelho e quadril (30 inválidas, 2 pendentes).
- Lembretes por push só existem no modo semanal — no contínuo não há dia
  agendado para mirar. Saem `reminderLeadMinutes` antes de `workoutTime`, nos
  dias marcados, e só para quem ligou o aviso em Configurações. O fuso é o do
  install (`REMINDER_TIMEZONE`), não por usuário: o app é de uso pessoal. O
  envio depende de chaves VAPID (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`,
  geradas com `npx web-push generate-vapid-keys`) e, no iPhone, do app
  instalado na tela de início.
- Substituição automática por dor (avisar e oferecer troca quando o usuário
  marca dor numa região contraindicada) usa só o catálogo com `status = 'ok'`.
- Sem CI: build e deploy são manuais.
- O `start` do `package.json` da API aponta para `dist/server.js`, mas o
  Dockerfile roda `dist/src/server.js`. Só o Dockerfile é usado hoje.
- O compose publica `5173:5173` para o `web`; no alvo de produção o container é
  nginx na 80, então esse mapeamento fica morto (o Caddy fala com `web:80`).
