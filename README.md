# RunGuard

**See the injury coming before it happens.**

RunGuard is an injury-prevention platform for high school running teams. It syncs
each athlete's training data (Strava, Apple Health, and the RunGuard app), computes
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

> The database file lives at `website/data/` and is git-ignored, so a fresh clone
> starts empty — run `npm run seed` once from `website/` to generate the demo team.
> Be aware that `npm run seed` **wipes and rebuilds** the roster; don't run it
> against data you want to keep.

## Try the demo

From the landing page:

- **Coach demo** — click "Coach demo" (or "Coach login") and enter the password **`milemarker`** (leave email blank). You'll land on the team roster — click any athlete (try **Ethan Park**, who's returning from a shin injury) to see their detail page and body scan.
- **Athlete demo** — click "Athlete demo" → **"Try the demo athlete (Ethan Park)"**. This opens the athlete's own RunGuard app: Home, Training, Stats (body scan + intensity calendar), Recovery, Race, and AI Chat.

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
