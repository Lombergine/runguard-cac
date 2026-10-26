# RunGuard

**See the injury coming before it happens.**

RunGuard is an injury-prevention platform for high school running teams. It syncs
each athlete's training data (Apple Health, via the RunGuard iPhone app), computes
their acute:chronic workload ratio, mileage ramps, training monotony, and recovery
signals (HRV, resting HR, sleep), and flags at-risk runners **before** practice starts.

Coaches get a whole-roster dashboard; athletes get their own app with a live "body scan"
that lights up injured or sore areas, a readiness score, an intensity calendar, race
predictions, and an AI coaching chat.

## Repo layout

Two sibling projects. Each is self-contained, with its own `package.json` — there
is no root `package.json` and no workspace tooling.

- **`website/`** — the Next.js web app. Despite the name it is the server for
  *both* clients: the coach dashboard, the mobile API (`/api/mobile/*`), and the
  scoring engine all live here.
- **`app/`** — the mobile client. Talks to `website/` over HTTP and never
  connects to the database directly.

## Quick start

Requires [Node.js](https://nodejs.org) 20+.

```bash
cd website
npm install
npm run dev
```

Then open **http://localhost:3000**.

**You need no accounts to do this** — not Vercel, not Supabase, no database
password. With `DB_DRIVER` unset the app runs against the local SQLite file,
which is exactly what that default is for. Ask for credentials only if you
specifically need the shared deployment database; see [DEPLOY.md](DEPLOY.md).

One trap: do not copy someone else's `website/.env.local` to get started. Theirs
may set `DB_DRIVER=supabase`, which points at a shared database, demands a
password you have not been given, and disables the demo login below.

> The database file lives at `website/data/` and is git-ignored, so a fresh clone
> starts empty — run `npm run seed` once from `website/` to generate the demo team.
> Be aware that `npm run seed` **wipes and rebuilds** the roster; it refuses to run
> if it finds data it didn't create (real accounts, device tokens, chats), and
> `--force` overrides that. It only ever seeds the local SQLite file, never a
> deployed database.
>
> Seeding prints one device token per athlete at the end. **Those are credentials** —
> each one reads that athlete's full profile and writes health data through
> `/api/mobile/*`. They are random by default and change on every seed, so copy them
> out if you need them; they are not stored anywhere else.

## Try the demo

From the landing page:

- **Coach demo** — click "Coach demo" (or "Coach login") and enter the password **`milemarker`** (leave email blank). You'll land on the team roster — click any athlete (try **Ethan Park**, who's returning from a shin injury) to see their detail page and body scan.
- **Athlete demo** — click "Athlete demo" → **"Try the demo athlete (Ethan Park)"**. This opens the athlete's own RunGuard app: Home, Training, Stats (body scan + intensity calendar), Recovery, Race, and AI Chat. That button signs in with a fixed token, so it needs the roster seeded with `npm run seed -- --demo-tokens` (local SQLite only — those tokens are derivable from the athlete names in `scripts/seed.ts`, so never use them anywhere shared). With a default seed, sign in with a token printed by the seeder instead.

## RunGuard 2.0 (Congressional App Challenge 2026)

The `cac-2.0` branch adds, on the athlete's Stats tab: a personal threshold
(where the universal 1.5 cutoff sits in this athlete's own ratio history, and
their own 90th/95th percentiles, drawn on the workload chart), a self-audit
(how much of the score is just the last seven days, Impellizzeri et al. 2021,
with a bootstrap interval), a data check on the training log, and a gait
channel from Apple Watch running dynamics. On the coach dashboard, a team
audit: per-athlete score trust, and the experiment from Impellizzeri et al.
(2021) run on the team's own injury log, the shown ratio against a ratio whose
denominator is shuffled noise. And "Explain my numbers": a language model that
may only repeat the figures the server computed, validated against them, with
RunGuard's own wording as the fallback. The statistics are ported from
Aditya's Python package [`acwr`](https://github.com/Lombergine/acwr) into
`website/src/lib/acwrDiagnostics.ts` and checked against it:

```bash
cd website && npm test        # 43 tests, the statistics against the Python reference to 1e-9
```

AI assistance on this work is disclosed in [`DISCLOSURE.md`](DISCLOSURE.md).
Submission documents are in `docs/cac/`.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- SQLite via `better-sqlite3` locally, Supabase Postgres when deployed —
  chosen explicitly by `DB_DRIVER`, see [DEPLOY.md](DEPLOY.md)
- Recharts for charts, Tailwind-style utility CSS
- Sports-science engine (ACWR, TRIMP, monotony, readiness) in `website/src/lib/`

## Project layout

```
website/              the Next.js app — web UI, mobile API, and scoring engine
  src/
    app/              Next.js routes (landing, coach dashboard, athlete portal, API)
    components/       UI — AthleteModel (body scan), IntensityCalendar, charts, athlete tabs
    lib/              data model, risk/fitness engine, profile builder, AI coach
    lib/db/driver.ts  the only file that knows which database is in play
  scripts/seed.ts     generates the demo team + a year of training data
  supabase/           Postgres DDL, applied by hand (see DEPLOY.md)
  data/               local SQLite file (git-ignored)
  Dockerfile          production image — build with website/ as the context
app/                  the mobile client (see app/README.md)
DEPLOY.md             how to put it online
```

---

Built as a demo. Not medical advice.
