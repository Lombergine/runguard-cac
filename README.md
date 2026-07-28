# RunGuard

**See the injury coming before it happens.**

RunGuard is an injury-prevention platform for high school running teams. It syncs
each athlete's training data (Strava, Apple Health, and the RunGuard app), computes
their acute:chronic workload ratio, mileage ramps, training monotony, and recovery
signals (HRV, resting HR, sleep), and flags at-risk runners **before** practice starts.

Coaches get a whole-roster dashboard; athletes get their own app with a live "body scan"
that lights up injured or sore areas, a readiness score, an intensity calendar, race
predictions, and an AI coaching chat.

## Quick start

Requires [Node.js](https://nodejs.org) 20+.

```bash
npm install
npm run dev
```

Then open **http://localhost:3000**.

> The demo database is already included, so you can run it right away. To regenerate
> fresh demo data at any time, run `npm run seed`.

## Try the demo

From the landing page:

- **Coach demo** — click "Coach demo" (or "Coach login") and enter the password **`milemarker`** (leave email blank). You'll land on the team roster — click any athlete (try **Ethan Park**, who's returning from a shin injury) to see their detail page and body scan.
- **Athlete demo** — click "Athlete demo" → **"Try the demo athlete (Ethan Park)"**. This opens the athlete's own RunGuard app: Home, Training, Stats (body scan + intensity calendar), Recovery, Race, and AI Chat.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- SQLite via `better-sqlite3`
- Recharts for charts, Tailwind-style utility CSS
- Sports-science engine (ACWR, TRIMP, monotony, readiness) in `src/lib/`

## Project layout

```
src/
  app/            Next.js routes (landing, coach dashboard, athlete portal, API)
  components/     UI — AthleteModel (body scan), IntensityCalendar, charts, athlete tabs
  lib/            data model, risk/fitness engine, profile builder, AI coach
scripts/seed.ts   generates the demo team + a year of training data
```

---

Built as a demo. Not medical advice.
