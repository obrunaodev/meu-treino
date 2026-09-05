# Meu Treino

Meu Treino is an offline-first strength-training application built around repeating workout cycles instead of a calendar-first schedule. Each user creates a personal program, records workouts, reviews progress and pain history, manages gym equipment and exercise media, and can operate an active workout from a private WhatsApp group.

The interface supports Brazilian Portuguese and American English. Brazilian Portuguese is the default locale, while all web and API routes use stable English URL segments.

## Contents

- [Product capabilities](#product-capabilities)
- [Architecture and technology](#architecture-and-technology)
- [Repository layout](#repository-layout)
- [Local development](#local-development)
- [Authentication](#authentication)
- [WhatsApp integration](#whatsapp-integration)
- [Media storage](#media-storage)
- [Offline synchronization](#offline-synchronization)
- [Training model](#training-model)
- [Catalog import](#catalog-import)
- [Testing](#testing)
- [Production deployment](#production-deployment)
- [Operations](#operations)
- [Design system](#design-system)
- [Route reference](#route-reference)
- [Known limitations](#known-limitations)

## Product capabilities

### Programs and workouts

- Onboarding creates the user's first program and ordered workout templates.
- A cycle is one complete pass through the workout sequence. For example, Workout A followed by Workout B is one cycle.
- Block duration is configurable in weeks, and period duration is configurable in months.
- Programs can run continuously or follow selected weekdays.
- Workout templates can be created, renamed, reordered, edited, and removed.
- Each template configures exercise order, target sets, repetition range or timed duration, target effort, rest interval, tracking mode, and optional cardio.
- Cardio is selected from the equipment configured for the user's gym instead of entered as unrestricted text.

### Live workout

- The session entry page previews the expected workout and allows another template to be selected before starting.
- The active session displays pending, skipped, and completed exercises.
- Opening an exercise starts its focused set flow with editable numeric weight and repetition inputs.
- The first set is prefilled from the latest comparable workout. Later sets inherit the preceding set's weight.
- Compact tracking records all planned sets from one entry. Full tracking records each set separately.
- Rest derives from an absolute timestamp and survives backgrounding or reloading the app.
- Completing the final set returns to the exercise overview. Cardio starts only after an explicit action.
- Leaving an exercise before completion marks it as skipped. It remains available to reopen and does not count as completed unless values are later recorded.
- Warm-up sets are recorded with `is_warmup` and excluded from volume and progress statistics.
- Exercise instructions remain inside the exercise accordion. Images open in a modal, and YouTube execution links open separately.
- A session left inactive for six hours is automatically closed as incomplete.

### Perceived effort

The UI uses a four-level effort scale while retaining numeric RIR in storage for compatibility:

| Display level | Stored RIR | Interpretation |
|---|---:|---|
| Light | 4 | Several repetitions remained with stable speed |
| Moderate | 2 | Clear reserve; the normal progression target |
| Heavy | 1 | The last repetition required substantial effort |
| Very heavy | 0 | No repetition remained or execution quality degraded |

### Exercises and equipment

- The global academy catalog can be imported into a user's editable exercise library.
- Exercises can be filtered by text, equipment, and image availability.
- The library supports grid and list layouts, with a maximum of three grid columns.
- Each exercise accepts one image. Uploading another replaces the current one, and the image can be deleted from the exercise detail view.
- Images preserve their intrinsic proportions and can be opened at full resolution.
- Equipment supports pin stacks, plates, body weight, and other load modes.
- Non-linear pin-stack machines can store the cumulative weight for every physical position.
- Plate-loaded articulated machines can mark load as per side while execution remains bilateral.
- Unilateral exercises can be symmetric or record each side independently.
- Exercise and equipment-level substitutions can be configured when changing gyms.

### History, health, and analytics

- The dashboard presents weekly workouts, exercise load or volume progression, pain history, muscle groups trained, and progress toward the current block and period.
- Charts provide direct values and table alternatives without internal scrollbars.
- History uses a navigable monthly calendar. Adjacent dates appear only to complete partial first and last weeks.
- Sessions are grouped by period, block, and cycle.
- Session details include the captured plan, sets, cardio, pain, notes, status, and timestamps.
- Session history can be edited or deleted. Deleting a session also soft-deletes its sets, cardio, and pain records.
- Cycle and block reports summarize adherence and training data for their scope.
- Set history is grouped by exercise and ordered by the timestamp at which each exercise was checked.
- Training data can be exported as CSV.
- Pain can be captured from selectable body regions and reviewed as a history.
- User-defined functional tests support frequency, units, side, history, and whether higher or lower values are better.
- Push reminders are available for scheduled weekly programs when VAPID is configured.

## Architecture and technology

```text
Browser / installed PWA
        |
        | HTTPS in production
        v
      Caddy
      /   \
     v     v
   Web     API <--------> WhatsApp bot
  React   Express          Baileys
            |                 |
            +------ Postgres--+
            |
            +------ MinIO (private)
```

The browser uses IndexedDB as its UI source of truth. The API is the synchronization, authentication, catalog, push, media, and integration boundary. Postgres is the durable relational store. MinIO holds binary exercise media. The WhatsApp process is isolated from the public network and is reachable only through the API over the Compose network.

Production uses Caddy for automatic TLS, same-origin API routing, security headers, compression, and SPA fallback. Development accesses Vite and the API directly. One Compose file serves both environments through environment-driven build targets and the optional `prod` profile.

| Component | Technology |
|---|---|
| Web | React 19, Vite 6, TypeScript, React Router, Dexie, i18next, PWA service worker |
| API | Node.js 22, Express 5, TypeScript, Drizzle ORM, Zod, Pino |
| WhatsApp | Baileys 6, Node.js, TypeScript, QR Code |
| Data | PostgreSQL 17 and MinIO S3 storage |
| Proxy | Caddy 2 |
| Tests | Vitest, Testing Library, Playwright, real Postgres integration tests |
| Delivery | Docker Compose and GitHub Actions |

## Repository layout

```text
.
├── api/                         Express API, Drizzle schema, migrations, jobs
├── bot/                         Isolated WhatsApp service
├── docs/design-system.md        Persistent UI contract
├── proxy/Caddyfile              Production TLS and routing
├── scripts/deploy.sh            Health-checked activation and rollback
├── web/                         React PWA and browser tests
├── catalogo-enriquecido.json    Source academy catalog
├── docker-compose.yml           Development and production services
└── .github/workflows/pipeline.yml
```

## Local development

Requirements are Docker with Docker Compose and Node.js 22 with npm when checks run outside containers.

```bash
cp .env.example .env
# Replace every placeholder secret in .env.
docker compose up -d
docker compose exec api npm run db:migrate
docker compose exec api npm run catalog:import
```

| Service | Default URL |
|---|---|
| Web | `http://localhost:5173` |
| API | `http://localhost:3000` |
| Health | `http://localhost:3000/health` |
| MinIO API | `http://localhost:9000` |
| MinIO console | `http://localhost:9001` |

Development Docker targets mount source directories and run watch processes. Environment changes require recreating the affected container. Changing `VITE_API_URL` requires rebuilding the web image because Vite writes it into the browser bundle.

To import the catalog into an existing user's personal library:

```bash
docker compose exec -e TARGET_USER_EMAIL=user@example.com api npm run catalog:import-user
```

The import is idempotent for catalog-backed equipment and exercises.

Stop services without deleting durable data:

```bash
docker compose down
```

Named volumes preserve Postgres, MinIO, and Caddy data. Do not add `--volumes` unless permanent local data removal is intentional.

## Authentication

### Google OAuth

Create an OAuth 2.0 client of type **Web application** in Google Cloud and configure:

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

The production authorized redirect URI is:

```text
https://treininho.duckdns.org/auth/google/callback
```

The callback paths have different responsibilities:

- `/auth/google/callback` is the API endpoint registered with Google.
- `/auth/callback` is the React route reached after the API establishes the application session.

Authentication uses Authorization Code with PKCE. Refresh credentials are stored in an HTTP-only cookie, while the short-lived access token stays in memory. Any valid Google account is accepted; there is no trainer or administrator account type.

### Temporary development login

This is an authentication bypass and is disabled by default:

```bash
openssl rand -base64 32
```

```dotenv
DEV_LOGIN_ENABLED=true
DEV_LOGIN_TOKEN=<generated-token>
```

An email plus the shared token creates or reopens a user whose Google subject starts with `dev:`. The API refuses to start when the token is shorter than 32 characters. Production additionally requires `DEV_LOGIN_ALLOW_IN_PRODUCTION=true` as explicit acknowledgement.

Do not leave this enabled after Google OAuth is available. Anyone who obtains the token can impersonate any email accepted by the form.

## WhatsApp integration

The WhatsApp page at `/whatsapp` is available under **Settings → Integrations**. It generates a QR Code, reports connection state, lists available groups, and authorizes exactly one group. Other chats and groups are ignored.

Recommended setup:

1. Create a group from the WhatsApp account the bot will link.
2. Keep only that account in the group.
3. Open `/whatsapp`, connect, and scan the QR Code from WhatsApp linked devices.
4. Select the training group in the application.

The bot accepts common Portuguese and English aliases plus a one-character typo in command names. Replies are currently Portuguese-first.

| Command | Purpose |
|---|---|
| `/today` or `/hoje` | Preview the expected workout without starting; report an open session when present |
| `/today --link` | Preview and include execution links |
| `/start` or `/iniciar` | Start or resume the next workout in the cycle |
| `/start --link` | Start or resume and include execution links |
| `1 100kg 3x15 moderado` | Record all sets for exercise 1 in the active session |
| `/skip 3` or `/pular 3` | Skip exercise 3 in the active session |
| `/end` or `/fim` | Close the active session; unresolved exercises remain incomplete |
| `/edit` | Show the most recent session by workout date and explain edit syntax |
| `/edit 1 70kg 3x15 pesado` | Replace exercise 1 values in the current or most recent session |
| `/last` or `/ultimo` | Show the current or most recent workout |
| `/history` or `/historico` | Show sessions from the current week |
| `/help` or `/ajuda` | Report the workflow stage and commands available at that stage |
| `/clear` or `/limpar` | Revoke known group messages, including the command message |

Exercise entries accept `kg`, `kgs`, `k`, `lb`, and `lbs`; decimal commas; `x`, `×`, `*`, `-`, or `/` separators; numeric RIR such as `3rir` or `3r`; and perceived-effort words. Values are range-validated before database writes.

`/skip` only works during an active session. `/edit` targets an open session first; otherwise it selects the most recent session by `started_at`, not its edit timestamp. The bot automatically completes a session after every planned exercise has been recorded.

`/clear` can only revoke messages for which WhatsApp still permits deletion and whose keys the bot observed. It is not a general-purpose server-side purge of WhatsApp history. Baileys is unofficial; protocol changes or device revocation can require a new QR scan.

## Media storage

MinIO stores binary files that do not belong in relational rows. The current product stores one image per user exercise.

Uploads pass through the API:

1. Multer enforces the upload-size boundary.
2. The API validates magic bytes instead of trusting multipart MIME metadata.
3. Sharp enforces a decoded-pixel limit, fixes orientation, and re-encodes as WebP.
4. A full image and 640 px thumbnail are written to the private bucket.
5. The browser receives authenticated API streams with `ETag`, immutable cache headers, and byte-range support.

The browser never receives MinIO credentials or a public object URL. The service worker runtime-caches `/api/media/*` for offline reuse. A new upload replaces the active image. Deletion is soft so offline clients observe it; a background purge removes deleted objects after the retention window.

## Offline synchronization

The React app reads and writes IndexedDB and does not block normal interaction on network requests. Each mutation updates its Dexie table and appends an outbox operation in the same local transaction. It is pushed when connectivity returns and removed only after server acknowledgement.

Important invariants:

- UUIDv7 identifiers are generated by the client, preserving offline relationships.
- Synchronized tables use soft deletion because hard deletion is invisible to disconnected devices.
- Postgres assigns a monotonic global `rev` through a sequence and update trigger.
- Pull cursors are tracked per entity so pagination in one table cannot skip another.
- Push operations are atomically claimed and idempotent by operation ID.
- Postgres `numeric` values are serialized to JavaScript numbers at the API boundary.
- Page hiding and visibility changes trigger an immediate best-effort outbox flush.

The server performs field-level three-way merges from the base, local, and current server rows. Independent fields merge automatically. Same-field edits become manual conflicts. Append-only entities union naturally, settings use last-write-wins, and delete-versus-edit resurrects the edited row.

Unresolved conflicts appear as a persistent toast and on `/conflicts`. Ordinary queued-change notifications are dismissible transient toasts.

## Training model

- **Workout:** one template, such as Workout A.
- **Cycle:** one pass through every ordered workout, such as A + B.
- **Block:** a configurable number of calendar weeks, commonly one or two.
- **Period:** a configurable number of calendar months, commonly one.

The cycle determines the next workout. Calendar grouping measures longer-term progression without replacing cycle order. Cycle, block, and period labels are derived from chronological sessions and program cadence, so removing a session does not leave permanent numbering gaps.

### Immutable plan snapshots

Starting a session captures an immutable `plan_snapshot`, preventing future template edits from changing historical meaning. It includes the template identity and name, exercise identity and order, set and repetition targets, target RIR, equipment and load mode, rest interval, unilateral and per-side configuration, and tracking mode. History and reports use this snapshot instead of rebuilding an old workout from the current template.

Weights are stored internally in kilograms and converted for display. A per-side exercise stores the load mounted on one side. Volume calculations use the captured load mode rather than current exercise settings.

## Catalog import

`catalogo-enriquecido.json` is the global read-only academy source. The importer extracts 295 exercises, 40 equipment stations, and 17 groups, links exercises to station codes, and converts source names to sentence case.

The importer repairs recognized UTF-8-as-Latin-1 mojibake before upserting rows.

The source field `exercicio_exclusao` contains a replacement exercise to offer when the original is contraindicated; it is not an exercise to avoid. Relationships are stored in `catalog_pain_swaps` with review status. Only `status = 'ok'` substitutions are eligible for automatic suggestions. Knee and hip source data includes missing or contraindicated targets and remains excluded until curated. This inferred mapping is not a clinical safety guarantee.

## Testing

Install locked dependencies:

```bash
npm ci --prefix api
npm ci --prefix web
npm ci --prefix bot
```

Run project checks:

```bash
npm test --prefix api
npm run typecheck --prefix api
npm run build --prefix api

npm test --prefix web
npm run typecheck --prefix web
npm run build --prefix web

npm test --prefix bot
npm run typecheck --prefix bot
npm run build --prefix bot
```

Integration and browser suites require real services:

```bash
npm run test:integration --prefix api
npm run test:e2e --prefix web
```

Playwright runs against an already-running web, API, Postgres, MinIO, and bot stack. If the API does not expose temporary development login, browser tests skip instead of modifying a real account. CI enables an isolated account and covers authentication, onboarding, catalog and media, templates, live sessions, reload persistence, cardio, dashboard, WhatsApp configuration, calendar reports, historical edits, cascades, and final outbox drainage.

## Production deployment

The single Compose file also describes production. Core production values are:

```dotenv
NODE_ENV=production
BUILD_TARGET=production
VITE_API_URL=
APP_ORIGIN=https://treininho.duckdns.org
GOOGLE_REDIRECT_URI=https://treininho.duckdns.org/auth/google/callback
SITE_ADDRESS=treininho.duckdns.org
```

Do not expose Postgres or MinIO publicly in production.

### GitHub Actions

`.github/workflows/pipeline.yml` runs on pull requests, pushes to `main`, and manual dispatches:

1. The quality matrix tests, type-checks, and builds `api`, `web`, and `bot` independently.
2. Integration starts real PostgreSQL and MinIO, applies migrations, imports the catalog, starts services, runs API integration tests, and executes Playwright in Chromium.
3. After both jobs succeed on a non-pull-request event, production `linux/amd64` images are built on GitHub-hosted infrastructure.
4. Images are transferred to the VPS over SSH, and the server activates the exact commit and image tag.

Required GitHub production secrets:

| Secret | Purpose |
|---|---|
| `DEPLOY_HOST` | VPS hostname or IP |
| `DEPLOY_USER` | Restricted SSH deployment user |
| `DEPLOY_SSH_KEY` | Dedicated private deployment key |
| `DEPLOY_KNOWN_HOSTS` | Pinned SSH host key |

Application secrets remain in `/opt/meu-treino/.env` on the VPS and are not copied through Actions.

`scripts/deploy.sh` serializes deployments, starts data services, creates the private bucket, applies migrations, imports the catalog, starts application containers, waits for health, checks the public HTTPS `/health`, and restores the previous application image tag if activation fails. Migrations must remain backward-compatible with the preceding release because image rollback does not reverse schema changes.

The pipeline never pushes Git commits. Source pushes remain a deliberate developer action.

## Operations

```bash
docker compose ps
docker compose logs --tail=200 api
docker compose logs --tail=200 whatsapp-bot
docker compose logs --tail=200 proxy
curl --fail https://treininho.duckdns.org/health
```

Production images are built in CI so the Oracle 1 GB server does not compile Node.js, Sharp, or Vite. Configure approximately 2 GB of swap and monitor actual usage after connecting WhatsApp. Postgres, MinIO, API, bot, web, Caddy, and the operating system share the same RAM.

Durable state is split between the Postgres `db-data` volume, MinIO `minio-data`, and Caddy certificate volumes. A complete restore requires mutually consistent Postgres and MinIO backups. Browser IndexedDB is an offline working replica, not a production backup.

## Design system

The external mockup is no longer required. Maintained sources of truth are:

1. `web/src/styles.css` for executable tokens, responsive rules, and layouts;
2. `web/src/components/ui.tsx` for shared primitives;
3. `docs/design-system.md` for intent, invariants, and workflow.

The primary theme uses warm dark surfaces, brick-red accents, Barlow Condensed headings, IBM Plex Sans body text, and IBM Plex Mono data labels. A complete light theme is selectable.

Interface work starts at 390–420 px. Mobile provides five destinations distributed with `space-between`; secondary pages remain under **More**. At 56 rem the layout switches to a 232 px grouped sidebar.

Read `docs/design-system.md` before UI changes. Intentional visual-language changes must update both implementation and documentation.

## Route reference

### Web

| Route | Page |
|---|---|
| `/` | Dashboard |
| `/onboarding` | Program onboarding |
| `/session` | Today's preview and workout selection |
| `/session/:sessionId` | Active workout overview |
| `/session/:sessionId/exercise/:itemId` | Focused exercise flow |
| `/workouts` | Workout management |
| `/exercises` | Exercise library |
| `/equipment` | Equipment and cardio catalog |
| `/pain` | Pain history |
| `/functional-tests` | Functional tests |
| `/history` | Calendar and grouped history |
| `/history/:sessionId` | Session report and editing |
| `/history/reports/cycle/:programId/:cycleNumber` | Cycle report |
| `/history/reports/period/:periodNumber/block/:programId/:blockNumber` | Block report |
| `/settings` | Preferences and integrations |
| `/conflicts` | Manual sync conflict resolution |
| `/whatsapp` | WhatsApp connection and guide |
| `/more` | Mobile secondary navigation |

### HTTP

| Prefix | Responsibility |
|---|---|
| `/health` | Public health check |
| `/auth/*` | Google OAuth, refresh, logout, and optional development login |
| `/api/sync/*` | Offline push, pull, and conflict resolution |
| `/api/catalog/*` | Global catalog |
| `/api/media/*` | Authenticated upload, stream, replacement, and deletion |
| `/api/push/*` | Push configuration and subscriptions |
| `/api/whatsapp/*` | WhatsApp state, QR connection, groups, and selection |

## Known limitations

- Knee and hip pain substitutions require catalog and clinical curation before all source relationships can be enabled.
- Push reminders require a weekly schedule, VAPID keys, and browser permission. iOS requires an installed Home Screen PWA.
- Reminder scheduling uses the installation-wide `REMINDER_TIMEZONE`, not a per-user timezone.
- WhatsApp depends on an unofficial protocol implementation and can be disrupted by upstream changes.
- The Oracle 1 GB target has little memory headroom and must be monitored, particularly with WhatsApp connected and image processing active.
