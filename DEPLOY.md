# Deploying RunGuard

RunGuard is a Next.js (App Router) app backed by Supabase Postgres. The website
and the iPhone app's API (`/api/mobile/*`) are the same deployment. Recommended
host: **Vercel** (free tier is fine to start).

## 1. Prerequisites

- The code is on GitHub (`Lombergine/REALRUNGUARD`).
- Your Supabase project is set up and seeded (`npm run seed`).
- Supabase Auth email confirmation is off (Authentication → Providers → Email)
  if you want instant coach sign-ups.

## 2. Import into Vercel

1. Go to vercel.com → **Add New… → Project** → **Import Git Repository** →
   pick `REALRUNGUARD`.
2. Framework preset: **Next.js** (auto-detected). Leave build settings default
   (`next build`).
3. Set the environment variables below **before** the first deploy.
4. Click **Deploy**. You'll get a URL like `https://runguard.vercel.app`.

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)

Required:

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

`DB_PASSWORD` is preferred over a full `DATABASE_URL` — the app fills in the
host/user/db for your Supabase project automatically, and a raw password avoids
URL-encoding issues. (You can still set `DATABASE_URL` instead if you prefer.)

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

- All data pages are `force-dynamic`, so nothing hits the database at build time.
- `npm run seed` is a manual one-off; it is not part of the Vercel build.
- Row Level Security is enabled on all tables; the app connects with the owner
  role and gates access in the API layer, so the public anon API stays locked.
