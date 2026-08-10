# Deploying RunGuard

The app lives in **`website/`**. Every host below therefore needs its **root
directory** (or Docker build context) set to `website` — that is the one setting
that changes as a result of the repo's two-folder layout. All commands in this
file are run from `website/` unless stated otherwise.

RunGuard talks to one of two databases, chosen explicitly by `DB_DRIVER`:

| `DB_DRIVER` | Database | Use |
|---|---|---|
| unset or `sqlite` | local file at `DATABASE_PATH` | testing — the default, no credentials needed |
| `supabase` | Supabase Postgres over the pooler | deployment |

Nothing is inferred from `NODE_ENV`. That is deliberate: `NODE_ENV` is set by
whichever npm script ran, so the Supabase path would be untestable without a
production build, and which database received a write would be decided by
something nobody wrote down. Setting the variable explicitly means you can point
a normal dev server at the real database:

```bash
cd website
npm run dev                        # local SQLite file, unchanged
DB_DRIVER=supabase npm run dev     # hot reload, writing to Supabase
```

If `DB_DRIVER=supabase` and no `DB_PASSWORD`/`DATABASE_URL` is set, the app
refuses to start rather than quietly falling back to a local file — on a
serverless host that fallback writes athlete data to a container that is deleted
on the next deploy, while every health check keeps passing.

**Which host you can use follows from that choice.** With `DB_DRIVER=supabase`
there is no database file, so serverless hosts are fine and **Vercel is the
simplest option** (Option A). With SQLite you still need a persistent disk, which
rules Vercel out — use Railway, Render or Fly (Options B–D) with the
`Dockerfile` in `website/`.

## Environment variables

Required in every deployment:

| Name | Value |
|---|---|
| `SESSION_SECRET` | `openssl rand -hex 32`. **Required** — the app throws rather than signing cookies with the public dev default. |

Required for `DB_DRIVER=supabase`:

| Name | Value |
|---|---|
| `DB_DRIVER` | `supabase` |
| `DB_PASSWORD` | the database password from Supabase → *Project Settings → Database*. Preferred over `DATABASE_URL`: the app fills in host/user/db itself, so a password containing `@ # : /` needs no URL-encoding. |
| `DATABASE_URL` | full connection string, as an alternative to `DB_PASSWORD` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME` | optional overrides; defaults target the Supabase pooler on 6543 |

Required for SQLite hosts (Options B–D):

| Name | Value |
|---|---|
| `DATABASE_PATH` | `/data/runguard.db`, on a mounted persistent disk |

Optional:

| Name | Purpose |
|---|---|
| `COACH_PASSWORD` | demo-team unlock password (defaults to `milemarker` — change it) |
| `OLLAMA_MODEL`, `OLLAMA_BASE_URL` | the local AI coach. Unset means the rule engine answers everything; there is no hosted-model path. |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_VERIFY_TOKEN` | Strava sync |

None of these carry the `NEXT_PUBLIC_` prefix, so they stay server-side and never
reach the browser bundle.

> There is no `ANTHROPIC_API_KEY` and no anon-key client path. The hosted-Claude
> dispatcher was deleted deliberately — it POSTed a minor's HR, HRV, sleep,
> soreness and injury history to `api.anthropic.com`. See the comment above
> `answer()` in `website/src/lib/chat.ts`.

## Option A — Vercel + Supabase (recommended)

1. Push this repo to GitHub. `.gitignore` covers `.env*`, so no secret is
   committed — keep it that way.
2. Apply the schema once: run
   `website/supabase/migrations/0001_risk_snapshots_and_chat_engine.sql` in the
   Supabase SQL editor (or via the Supabase MCP `apply_migration`).
3. https://vercel.com → **Add New → Project** → import the repo.
   Then **Settings → Build & Deployment → Root Directory** → `website`.
4. **Settings → Environment Variables** (Production, and Preview if you use it):
   set `DB_DRIVER=supabase`, `DB_PASSWORD`, `SESSION_SECRET`, `COACH_PASSWORD`.
   `cd website && vercel env pull .env.local` copies them to your machine, into
   the already-ignored `website/.env.local` — Next only reads `.env.local` from
   its own project root.
5. Deploy. Coaches go to `/signup`, athletes to `/athlete/signup`.

The connection uses Supabase's **transaction pooler on port 6543** with
`prepare: false`, which is what makes many short-lived serverless connections
workable — pgbouncer in transaction mode cannot hold prepared statements. One
connection per instance, so Vercel's concurrency won't exhaust the pooler.

To copy an existing local database up (this **replaces** the target):

```bash
cd website
DB_DRIVER=supabase DB_PASSWORD=... npx tsx scripts/migrate-to-pg.ts --yes
```

## Option B — Railway (SQLite, persistent volume)

1. Push this repo to GitHub (or use `cd website && railway up` from the CLI).
2. On https://railway.app → **New Project → Deploy from GitHub repo**. Set the
   service's **Root Directory** to `website` so Railway finds the `Dockerfile`.
3. **Add a Volume** (project → your service → *Variables/Volumes* → New Volume):
   - Mount path: `/data`
4. Set **Variables**: `DATABASE_PATH=/data/runguard.db`, `SESSION_SECRET`,
   `COACH_PASSWORD`.
5. Deploy. Railway gives you a public URL like
   `https://runguard-production.up.railway.app` — coaches go to `/signup`,
   athletes to `/athlete/signup`.

## Option C — Render (SQLite, persistent disk)

1. https://render.com → **New → Web Service** → connect the repo.
2. Runtime: **Docker**. **Root Directory:** `website` (the Docker build context
   follows it). Add a **Disk**: mount path `/data`, size 1 GB.
3. Environment variables: `DATABASE_PATH=/data/runguard.db`, `SESSION_SECRET`,
   `COACH_PASSWORD`.
4. Create Web Service → you get a `https://…onrender.com` URL.

## Option D — Fly.io (SQLite, persistent volume)

1. Install the Fly CLI, then from `website/`: `fly launch` (it reads the
   `Dockerfile`, and writes `website/fly.toml`).
2. `fly volumes create core_data --size 1`, then in `website/fly.toml` add a
   `[mounts]` block: `source = "core_data"`, `destination = "/data"`.
3. `fly secrets set SESSION_SECRET=$(openssl rand -hex 32) DATABASE_PATH=/data/runguard.db`
4. `fly deploy`.

## First run

- **SQLite:** the schema builds itself on first connect — no migration step.
- **Supabase:** the schema is *not* built at runtime, deliberately — concurrent
  serverless instances would race the DDL. Apply `supabase/migrations/` once, by
  hand, as in Option A step 2.
- **`npm run seed` only ever touches SQLite**, and it **wipes and rebuilds** the
  demo team. Leave production empty so real coaches and athletes fill it via
  `/signup` and `/athlete/signup`. To get the demo team into Supabase anyway,
  seed locally and run `scripts/migrate-to-pg.ts`.

## Point the mobile app at it

The app lives in [`app/`](app/README.md) and talks to this deployment over
`/api/mobile/*` with `Authorization: Bearer <device_token>`.

> **Status:** the sync described here is the target design. `app/` is currently
> an empty scaffold — the HealthKit read and its background-delivery entitlement
> still have to be built.

To put it on real phones you will need an Apple Developer account and
TestFlight. Each athlete enters your deployed URL and pastes the pairing token
from their web **Profile → Pair the RunGuard iPhone app**, then grants Apple
Health access once.

## Custom domain

All four hosts let you add a custom domain (e.g. `runguard.run`) in their
dashboard — add the domain, set the DNS record they show you, done. Then set
your Strava callback domain to match if you use Strava.

## Before a real deployment

- `/api/chat` has **no per-athlete rate limit**, so a logged-in athlete can loop
  questions for unbounded model spend. Device tokens never expire and cannot be
  revoked. Add a limiter before going live with a hosted model.
- Supabase tables have RLS enabled, but the app connects as the `postgres` role
  through the pooler, which **bypasses RLS**. Access control is
  `website/src/lib/apiAuth.ts` and nothing else. Do not add an anon-key client
  path without revisiting that.
