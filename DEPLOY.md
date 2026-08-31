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
| `DATABASE_URL` | the full pooler URI, from Supabase → **Connect**. Preferred: it names the project it connects to, so it cannot silently resolve to a different one. |
| `DB_PASSWORD` | the database password, as an alternative to `DATABASE_URL`. Avoids URL-encoding a password containing `@ # : /` — but see the warning below. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME` | overrides for the `DB_PASSWORD` form; the defaults target one specific project's pooler on 6543 |

> **`DB_PASSWORD` alone is only safe when there is one project.** The host and
> username fall back to defaults hardcoded in `src/lib/db/driver.ts`, so setting
> the password for a *second* project and forgetting `DB_HOST`/`DB_USER`
> connects to the first one — with no error, because those credentials are
> valid. Once more than one database exists, use `DATABASE_URL`.

Required for SQLite hosts (Options B–D):

| Name | Value |
|---|---|
| `DATABASE_PATH` | `/data/runguard.db`, on a mounted persistent disk |

Optional:

| Name | Purpose |
|---|---|
| `COACH_PASSWORD` | demo-team unlock password (defaults to `milemarker` — change it) |
| `OLLAMA_MODEL`, `OLLAMA_BASE_URL` | the local AI coach. Unset means the rule engine answers everything; there is no hosted-model path. |

None of these carry the `NEXT_PUBLIC_` prefix, so they stay server-side and never
reach the browser bundle.

> There is no `ANTHROPIC_API_KEY` and no anon-key client path. The hosted-Claude
> dispatcher was deleted deliberately — it POSTed a minor's HR, HRV, sleep,
> soreness and injury history to `api.anthropic.com`. See the comment above
> `answer()` in `website/src/lib/chat.ts`.

## Credentials

These four things are credentials. Handling is the same for all of them.

| Credential | What it opens |
|---|---|
| the athlete session token | one athlete's whole account — reads their profile, writes HealthKit data on their behalf. `a.<athleteId>.<hmac>`, minted by `signAthleteToken()` at login. It is the same value in the `core_athlete` cookie on the web and in `Authorization: Bearer` from the phone. |
| the coach session token | one team — its roster, every athlete's profile, the training calendar. `<teamId>.<hmac>`, minted by `signTeam()`. Same value in the `mm_session` cookie and in the app's Bearer header. |
| `SESSION_SECRET` | signs **both** of the above; whoever holds it can mint one for any athlete or any team |
| `DB_PASSWORD` / `DATABASE_URL` | the database, and every athlete in it |
| `COACH_PASSWORD` | the demo team's roster |

**The rules: never logged, never rendered, never in an error message, never in a
commit.** Two of those get broken by accident rather than by decision. *Never in
an error message* dies to a caught exception printed whole, or a
`JSON.stringify(profile)` in a report. *Never rendered* dies at sign-out: a
screen still showing athlete data is a screen still holding the token that
fetched it, so signing out has to clear the store, not just navigate away.

### Sessions are derived, not stored

Neither token exists in the database. Each one is an HMAC-SHA256 over a domain
string — `athlete:<id>` or `coach:<id>` — under `SESSION_SECRET`, and verifying
one is recomputing that HMAC and comparing with `timingSafeEqual`. Nothing is
looked up, so there is nothing to leak from a row and nothing to keep in step.

The two kinds cannot be confused for each other, because the domain is inside
the signed message: the same id under the same key produces different signatures
for a coach and for an athlete, so `verifyCoachToken` can never accept an
athlete's value and `verifyAthleteToken` can never accept a coach's.

**Rotating `SESSION_SECRET` is the revocation.** Set a new one and every athlete
session and every coach session in existence stops verifying, everywhere, at
once — old phones, web cookies, a token pasted into a support thread, tokens in
a log. That is a blunt instrument by design; it cannot revoke one device and
spare another, and everyone signs in again afterwards. Anything that spills a
token is handled by rotating the secret, and then by the athlete or coach
signing in again with their password.

There is no per-athlete revocation and no expiry beyond the cookie's `maxAge`.
If one is ever needed, it is a stored `token_version` column folded into the
signed string — not a return to a permanent secret in a row.

### `athletes.device_token` is vestigial

The column is still there and `scripts/seed.ts` still writes it, because
dropping it is a migration. **Nothing reads it for authentication.** It used to
be the entire credential for a minor's health data — 40 hex characters that
never expired and could not be revoked — handed to a coach to copy off a laptop
screen at a meet. There is no code path left that turns that string into a
session, and no payload that carries it.

### Do not let a secret cross a boundary protected only by a type

No mobile payload carries a credential now: `buildProfile()` does not select one,
and every `/api/mobile/*` response allow-lists its fields rather than spreading a
row. Keep it that way — an allow-list makes a new field invisible until someone
chooses to publish it, while a spread publishes it the moment it exists.

If a secret ever does have to cross into a client, `delete` the key rather than
omitting it from the type. A type is a compile-time claim, not a fence: the
runtime object still carries every key the server sent, so an undeclared field
survives any cast and is still there for a log line to serialise, for a
`{...athlete}` spread to copy into a debug view, and for a later `<Text>` to
render.

### Signing in

An athlete signs in at `/athlete/login` or in the app with the email and password
they signed up with (`/api/athlete-login`, `/api/athlete-signup`). A coach signs
in at `/login` or in the app (`/api/mobile/coach-login`). Pairing the phone is
just signing in on the phone — there is no pairing code, and no screen anywhere
renders a token.

Athletes join a team with the team's **join code**, which the coach sees on the
dashboard and on `/dashboard/connect`. That code adds an account to a roster; it
is not a credential and it opens nothing on its own.

## Option A — Vercel + Supabase (recommended)

1. Push this repo to GitHub. `.gitignore` covers `.env*`, so no secret is
   committed — keep it that way.
2. Apply the schema once: run `website/supabase/migrations/0000_base_schema.sql`
   in the Supabase SQL editor (or via the Supabase MCP `apply_migration`). That
   one file builds the whole database — the numbered migrations after it are
   deltas already folded into it, needed only by projects that predate it.
3. https://vercel.com → **Add New → Project** → import the repo.
   Then **Settings → Build & Deployment → Root Directory** → `website`.
4. **Settings → Environment Variables**: set `DB_DRIVER=supabase`,
   `DATABASE_URL` and `SESSION_SECRET`. See *Environments* below for which value
   each target gets — they are not the same.

   Prefer `DATABASE_URL` (the pooler URI from Supabase → **Connect**) over
   `DB_PASSWORD`. Both work, but `DB_PASSWORD` leans on the default host and
   username baked into `db/driver.ts`, so a target that sets the password and
   forgets `DB_HOST` connects to whichever project those defaults name — quietly,
   and successfully. A full URI cannot point somewhere you did not write down.

   `cd website && vercel env pull .env.local` copies the **Development** values
   to your machine, into the already-ignored `website/.env.local` — Next only
   reads `.env.local` from its own project root. It OVERWRITES that file, so
   anything you keep there and have not also set in Vercel is lost.
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

To copy one deployed database into another — moving accounts, or filling a new
project — use `scripts/copy-pg-to-pg.ts` instead. It intersects the columns of
the two schemas, so a target that has deliberately dropped a column still takes
the copy, which `pg_dump --data-only` cannot do. Do not route a Postgres-to-
Postgres move through the local SQLite file: the two drift independently, and
whichever table the file is behind on is silently overwritten with the older
copy.

```bash
cd website
export SRC_DB_URL='…'   # export, not inline: an inline password enters shell history
export DST_DB_URL='…'
npx tsx scripts/copy-pg-to-pg.ts          # dry run — reports both sides
npx tsx scripts/copy-pg-to-pg.ts --yes
```

## Environments

Vercel decides the target from the branch: the production branch deploys to
**Production**, every other branch to **Preview**, and **Development** is what
`vercel env pull` and `vercel dev` read. Point them at different databases —
a preview branch sharing production's database writes real athletes' check-ins,
and a bad migration on a branch corrupts live data.

| | `DB_DRIVER` | `DATABASE_URL` | `SESSION_SECRET` |
|---|---|---|---|
| Production | `supabase` | the PROD project | its own |
| Preview | `supabase` | the DEV project | its own, **different** |
| Development | `supabase` | the DEV project | **shared with Preview** |

The two Supabase projects, both in the RealRunGuard org (project refs are not
secrets — the password in the connection string is):

| | project ref | region |
|---|---|---|
| PROD | `xgcxfvsezsfxdujzjexd` | `us-east-1` |
| DEV | `mwwhgnrdownzbnwmbsgi` | `us-east-1` |

**Set `DATABASE_URL`, not `DB_PASSWORD`.** `db/driver.ts` falls back to a
hardcoded host and username when only a password is given, and those defaults
name a project this deployment no longer uses. A forgotten `DB_HOST` would then
connect somewhere unintended and succeed silently. A full `DATABASE_URL` names
its project and cannot resolve elsewhere.

**Development mirrors Preview.** `vercel env pull` returns
`DB_DRIVER=supabase` and the DEV `DATABASE_URL`, so `npm run dev` and
`vercel dev` both serve `http://localhost:3000` against the shared DEV project
rather than the local SQLite file. Preview and Development are written from one
source so the two are provably the same target — Vercel will not read Preview
values back (`vercel env pull` yields the literal `[SENSITIVE]`), so "I set both
the same" is not verifiable after the fact; rewriting both together is.

Development also carries `COACH_PASSWORD`, `DEMO_TEAM_ID`, `DEMO_ATHLETE_ID` and
the `OLLAMA_*` pair, purely so `vercel env pull` returns a working file. That
command **overwrites** `website/.env.local`; before those five were mirrored, a
pull silently destroyed the local demo setup.

`SESSION_SECRET` is shared between Preview and Development on purpose — both
reach the same DEV database, so a session valid on one is valid on the other and
crosses no boundary. **Production keeps its own**, which is the split that
matters: a shared secret there would make a session minted on any preview URL
valid against production.

To go back to the local SQLite file, comment out `DB_DRIVER` in
`website/.env.local`. Nothing else needs changing.

Two things follow from running on Supabase locally, both deliberate:

- **`SESSION_SECRET` becomes required.** `secret()` fails closed the moment
  `DB_DRIVER=supabase`, even on localhost, because cookies minted against a
  shared database must not be signed with the default published in `session.ts`.
- **The password login on `/login` stops working.** `api/login/route.ts`
  refuses the shared `COACH_PASSWORD` unless the driver is sqlite. Do not widen
  that gate. The demo itself is unaffected: the landing page's "See the coach
  dashboard" link goes through `/api/demo/coach` → `demoLogIn()`, which has no
  driver gate.

Cookie `secure` is **not** tied to `DB_DRIVER` — it follows `NODE_ENV`, which is
the transport question rather than the database question. It was tied to
`DB_DRIVER` once, and that made `DB_DRIVER=supabase npm run dev` mark cookies
`secure` over plain HTTP; browsers disagree about localhost in that case
(Chrome and Firefox allow it, Safari does not), so sign-in broke on some
machines and not others.

**A different `SESSION_SECRET` per target, not one shared value.** It signs coach
sessions, so a single secret makes a session minted on any preview URL valid on
production. `SESSION_SECRET` is required on Preview too: Vercel builds set
`NODE_ENV=production`, so `secret()` throws rather than falling back.

**Never set `OLLAMA_MODEL` or `OLLAMA_BASE_URL` on a deployment** — see the table
above and the note in `.env.example`. **Never point `DEMO_TEAM_ID` at a team with
real athletes**: it is read at build time and makes that roster public.

Environment variables apply to *new* deployments. Changing one does not affect
what is already running — redeploy.

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
`/api/mobile/*` with `Authorization: Bearer <session token>` — the athlete or
coach session it received when the person signed in.

**The backend URL is compiled in, not entered.** `src/lib/api.ts` reads
`EXPO_PUBLIC_API_URL` once at bundle time and there is no field anywhere in the
app to change it, so the build for TestFlight must carry the production URL and a
build for testing must carry the preview one. Unset, it falls back to
`http://localhost:3000` — which on a phone is the phone, and fails on every
screen. See `app/.env.example`.

To put it on real phones you will need an Apple Developer account and
TestFlight. Each athlete pastes the pairing token from their web **Profile → Pair
the RunGuard iPhone app**, then grants Apple Health access once.

## Custom domain

All four hosts let you add a custom domain (e.g. `runguard.run`) in their
dashboard — add the domain, set the DNS record they show you, done.

## Before a real deployment

- `/api/chat` has **no per-athlete rate limit**, so a logged-in athlete can loop
  questions for unbounded model spend. Add a limiter before going live with a
  hosted model.
- Supabase tables have RLS enabled, but the app connects as the `postgres` role
  through the pooler, which **bypasses RLS**. Access control is
  `website/src/lib/apiAuth.ts` and nothing else. Do not add an anon-key client
  path without revisiting that.
