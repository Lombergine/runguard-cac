# Getting RunGuard live so real people can sign up

RunGuard is a normal Next.js app with a SQLite database. The one rule for hosting:
**the database file must live on a persistent disk** (a "volume"), or every deploy
wipes your accounts. That rules out purely-serverless hosts like Vercel for the
database. The three hosts below all give you a free/cheap persistent volume and
deploy straight from the included `Dockerfile`.

---

## Option A — Railway (easiest, recommended)

1. Push this folder to a GitHub repo (or use `railway up` from the Railway CLI).
2. On https://railway.app → **New Project → Deploy from GitHub repo**. Railway
   auto-detects the `Dockerfile`.
3. **Add a Volume** (project → your service → *Variables/Volumes* → New Volume):
   - Mount path: `/data`
4. Set **Variables**:
   - `DATABASE_PATH=/data/runguard.db`
   - `SESSION_SECRET=` → paste output of `openssl rand -hex 32`
   - `COACH_PASSWORD=` → anything (only unlocks the demo team)
   - `ANTHROPIC_API_KEY=` → optional, turns on the smart AI coach
5. Deploy. Railway gives you a public URL like `https://runguard-production.up.railway.app`.
   That's your live site — coaches go to `/signup`, athletes to `/athlete/signup`.

## Option B — Render

1. https://render.com → **New → Web Service** → connect the repo.
2. Runtime: **Docker**. Add a **Disk**: mount path `/data`, size 1 GB.
3. Environment variables: same four as above (`DATABASE_PATH=/data/runguard.db`, etc.).
4. Create Web Service → you get a `https://…onrender.com` URL.

## Option C — Fly.io

1. Install the Fly CLI, then in this folder: `fly launch` (it reads the Dockerfile).
2. `fly volumes create core_data --size 1` then in `fly.toml` add a `[mounts]`
   block: `source = "core_data"`, `destination = "/data"`.
3. `fly secrets set SESSION_SECRET=$(openssl rand -hex 32) DATABASE_PATH=/data/runguard.db`
4. `fly deploy`.

---

## First run

- The database schema builds itself automatically on the first request — you do
  **not** need to run any migration.
- **Do NOT run `npm run seed` on your production site** — that wipes the DB and
  loads the 14 fake demo athletes. Leave production empty so real coaches and
  athletes fill it via `/signup` and `/athlete/signup`.
- Want the demo team on a separate throwaway URL? Deploy a second instance and run
  `npm run seed` there.

## Getting real Apple Health data in — the native app

Apple Health is the single hub. The **RunGuard iPhone app** (`milemarker-ios`) reads it
and syncs in real time three ways: every time the app is opened, on a timer while
open, and via **HealthKit background delivery** — iOS wakes the app the moment a new
run or night of sleep is written to Health, even when RunGuard is closed. No uploads,
ever. The web app is the companion dashboard for that same data.

The web dashboard's "Set range" (Strava) and date fields (Apple export import)
only bound an initial historical **backfill** — background HealthKit delivery
and the Strava webhook keep syncing new activity afterward regardless of what
range was chosen for that one-time backfill.

**Garmin / Coros / Fitbit / WHOOP users** don't need a separate integration — they
connect their device to Apple Health once (e.g. Garmin Connect → Settings → Apple
Health), and everything flows into RunGuard automatically.

To put the app on real phones:

1. You need an Apple Developer account ($99/yr) and TestFlight.
2. In `milemarker-ios`, build a dev/production build (`npx expo run:ios` or an EAS
   build). The HealthKit background entitlement is already configured in `app.json`.
3. Each athlete opens the app, enters your deployed site URL, and pastes the
   **pairing token** shown on their web **Profile → Pair the RunGuard iPhone app**.
   They grant Apple Health access once; from then on it's hands-off.

## Custom domain

All three hosts let you add a custom domain (e.g. `runguard.run`) in their dashboard —
add the domain, set the DNS record they show you, done. Then set your Strava
callback domain to match if you use Strava.
