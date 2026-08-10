# Deploying RunGuard

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
rules Vercel out — use Railway, Render or Fly (Options B–D) with the included
`Dockerfile`.

## 1. Prerequisites

## Option A — Vercel + Supabase (recommended)

1. Push this repo to GitHub. `.gitignore` covers `.env*`, so no secret is
   committed — keep it that way.
2. Apply the schema once: run `supabase/migrations/0001_risk_snapshots_and_chat_engine.sql`
   in the Supabase SQL editor (or via the Supabase MCP `apply_migration`).
3. https://vercel.com → **Add New → Project** → import the repo.
4. **Settings → Environment Variables** (Production, and Preview if you use it):
   - `DB_DRIVER=supabase`
   - `DB_PASSWORD=` → the database password from Supabase → *Project Settings →
     Database*. Alternatively set a full `DATABASE_URL`.
   - `SESSION_SECRET=` → `openssl rand -hex 32`. **Required** — the app throws
     without it rather than signing cookies with the public dev default.
   - `COACH_PASSWORD=` → anything (only unlocks the demo team)

   None of these carry the `NEXT_PUBLIC_` prefix, so they stay server-side and
   never reach the browser bundle. `vercel env pull .env.local` copies them to
   your machine, into the already-ignored `.env.local`.
5. Deploy. Coaches go to `/signup`, athletes to `/athlete/signup`.

The connection uses Supabase's **transaction pooler on port 6543** with
`prepare: false`, which is what makes many short-lived serverless connections
workable — pgbouncer in transaction mode cannot hold prepared statements.

To copy an existing local database up (this **replaces** the target):

```bash
DB_DRIVER=supabase DB_PASSWORD=... npx tsx scripts/migrate-to-pg.ts --yes
```

## Option B — Railway (SQLite, persistent volume)

1. Push this folder to a GitHub repo (or use `railway up` from the Railway CLI).
2. On https://railway.app → **New Project → Deploy from GitHub repo**. Railway
   auto-detects the `Dockerfile`.
3. **Add a Volume** (project → your service → *Variables/Volumes* → New Volume):
   - Mount path: `/data`
4. Set **Variables**:
   - `DATABASE_PATH=/data/runguard.db`
   - `SESSION_SECRET=` → paste output of `openssl rand -hex 32`
   - `COACH_PASSWORD=` → anything (only unlocks the demo team)
5. Deploy. Railway gives you a public URL like `https://runguard-production.up.railway.app`.
   That's your live site — coaches go to `/signup`, athletes to `/athlete/signup`.

## Option C — Render (SQLite, persistent disk)

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)

## Option D — Fly.io (SQLite, persistent volume)

| Name | Value | Secret? |
|------|-------|---------|
| `DB_PASSWORD` | your Supabase database password | yes |
| `SESSION_SECRET` | any long random string (`openssl rand -hex 32`) | yes |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://lmhxdnqxtecwogmnrdxg.supabase.co` | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your publishable/anon key | no |

Optional:

| Name | Purpose |
|------|---------|
| `COACH_PASSWORD` | demo-team unlock password (defaults to `milemarker` — change it) |
| `ANTHROPIC_API_KEY` | enables the live AI coaching chat |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_VERIFY_TOKEN` | Strava sync |

- **SQLite:** the schema builds itself on first connect — no migration step.
- **Supabase:** the schema is *not* built at runtime, deliberately — concurrent
  serverless instances would race the DDL. Apply `supabase/migrations/` once, by
  hand, as in Option A step 2.
- **`npm run seed` only ever touches SQLite.** It refuses to run against
  Supabase, because it wipes and rebuilds the demo team and resets
  `sqlite_sequence` — neither belongs on a shared database. Leave production
  empty so real coaches and athletes fill it via `/signup` and
  `/athlete/signup`. To get the demo team into Supabase anyway, seed locally and
  run `scripts/migrate-to-pg.ts`.

The database layer is already tuned for serverless (one connection per instance
against the Supabase transaction pooler on port 6543), so it won't exhaust
Supabase connection limits under Vercel's concurrency.

## 4. Point the iPhone app at it

In the RunGuard iOS app's setup screen, enter your deployed URL
(`https://runguard.vercel.app`) and your athlete pairing token (web app →
Profile → "Pair the RunGuard iPhone app"). Grant Apple Health access once and it
syncs in the background. See `../coreios/RUN_ON_IPHONE.md` to build the app onto
a phone or ship it via TestFlight / the App Store.

## 5. Notes

To put the app on real phones:

1. You need an Apple Developer account ($99/yr) and TestFlight.
2. In `milemarker-ios`, build a dev/production build (`npx expo run:ios` or an EAS
   build). The HealthKit background entitlement is already configured in `app.json`.
3. Each athlete opens the app, enters your deployed site URL, and pastes the
   **pairing token** shown on their web **Profile → Pair the RunGuard iPhone app**.
   They grant Apple Health access once; from then on it's hands-off.

## Custom domain

All four hosts let you add a custom domain (e.g. `runguard.run`) in their dashboard —
add the domain, set the DNS record they show you, done. Then set your Strava
callback domain to match if you use Strava.

## Before a real deployment

- `/api/chat` has **no per-athlete rate limit**, so a logged-in athlete can loop
  questions for unbounded model spend. Add one before going live with a hosted
  model.
- Supabase tables have RLS enabled, but the app connects as the `postgres` role
  through the pooler, which **bypasses RLS**. Access control is
  `src/lib/apiAuth.ts` and nothing else. Do not add an anon-key client path
  without revisiting that.
