# RunGuard — mobile app

Expo + TypeScript (SDK 57, blank template). **Currently an empty scaffold** —
everything below is the contract it will be built against, not something that
works yet. The only hand-written file in this folder is this README; the rest is
unmodified `create-expo` output.

The app's job: read HealthKit on-device, push it to the RunGuard server, and
show the athlete their own profile back.

## It never touches the database

`website/` owns the only database connection. The app is a plain HTTP client.
Database credentials must never ship inside an app binary — they would be
extractable from the IPA by anyone who downloads it.

## Base URL

`EXPO_PUBLIC_API_URL` — anything prefixed `EXPO_PUBLIC_` is inlined into the JS
bundle at build time, so read it as a **static dot-path** (`process.env.EXPO_PUBLIC_API_URL`);
computed lookups like `process.env[key]` are not substituted and come back
undefined.

For a dev build on a physical phone, `localhost` is the *phone*, so point at the
Mac's LAN address — the one `npx expo start` prints, e.g.
`http://10.0.0.166:3000`.

Cleartext HTTP to a LAN address is blocked by iOS App Transport Security unless
you allow it. In `app.json`, under `ios.infoPlist`:

- `NSAppTransportSecurity.NSAllowsLocalNetworking: true`
- `NSLocalNetworkUsageDescription` — a string explaining the local-network prompt

Production is HTTPS, so this is a dev-build concern only.

## Auth

`Authorization: Bearer <device_token>`, where the token is `dt_` followed by 40
hex characters (`newDeviceToken()`, `website/src/lib/db.ts`).

Three ways to obtain one:

- `POST /api/athlete-signup` → returns `{ ok, token }`; the route comments call
  this out as the path that "lets the iOS app sign up directly"
- `POST /api/athlete-login` with `{ email, password }` → returns `{ ok, name, token }`
- Manual fallback: the athlete copies it from the web **Profile → Pair the
  RunGuard iPhone app**

Store it in the **Keychain** (`expo-secure-store`), not `AsyncStorage`.

> Tokens **never expire and cannot be revoked**. A leaked token is permanent
> access to that athlete's health data until someone edits the database by hand.
> Treat it accordingly, and don't log it.

## `POST /api/mobile/ingest`

Body: `{ workouts?: [...], metrics?: [...] }`. At least one must be non-empty or
the response is `400`. Bad or missing token → `401`.

**Workouts.** `start` (ISO string) and `durationS` (number) are required; an
entry missing either is **skipped silently**, with no error and no count. Other
fields: `id` (used as the dedupe key — defaults to `` `${start}-${durationS}` ``),
`name`, `type`, `distanceM`, `avgHr`, `maxHr`, `calories`, `cadence`.

**Metrics.** `date` is required and is truncated to its first 10 characters, so
it must be `YYYY-MM-DD` — and it is a **local** day, not UTC. Sending a UTC
timestamp files evening workouts a day late. Other fields: `restingHr`, `hrv`,
`sleepHours`, `vo2max`, `respRate`, `spo2`, `wristTemp`, `sleepDeep`, `sleepRem`,
`sleepLight`.

**Units, since HealthKit's differ:** `distanceM` is metres, `durationS` seconds,
`sleepHours`/`sleepDeep`/`sleepRem`/`sleepLight` hours, `wristTemp` a **deviation**
in °C rather than an absolute temperature.

**Caps are silent.** Only the first **1000** workouts and **800** metrics of a
request are processed; the rest are dropped without a warning. Page large
backfills yourself.

Response: `{ ok, imported, importedWorkouts, importedMetrics }` (`imported` is a
back-compat alias). **`importedWorkouts` counts newly inserted rows only** —
inserts are `ON CONFLICT DO NOTHING` against
`UNIQUE(athlete_id, source, external_id)`, so re-sending data you already sent
returns `0`. Zero means "nothing new", not "failure".

**Retry is safe, but a 500 may be a partial write.** There is no wrapping
transaction, and an unparseable `start` throws mid-loop
(`new Date(w.start).toISOString()`), leaving earlier rows committed. Because
inserts dedupe, replaying the same batch converges.

## `GET /api/mobile/me`

Returns the athlete's computed profile: `CoreProfile` **minus** `series` and
`yearDays`, plus

- `series` — last **60** points only, narrowed to `{ date, load, km, acwr }`
  (no `minutes`/`acute`/`chronic`)
- `calendar` — the renamed `yearDays`, up to 366 entries. This dominates the
  payload size, so don't treat the response as small.

Keyed to `website/src/app/api/mobile/me/route.ts:19-23` — read that rather than
trusting this paragraph if the two disagree.

## Other endpoints already reachable

`apiAuth.ts` checks `Authorization: Bearer` *before* any cookie, so these accept
the same device token without any new server work: `/api/checkin`, `/api/chat`,
`/api/goal`, `/api/hrmax`, `/api/injury`, `/api/race`, `/api/race/[id]`,
`/api/race-result`, `/api/workout-status`, `/api/athlete/join-team`,
`/api/strava/sync`.

## Things to know before building

- **No CORS anywhere.** Fine for a native client, which isn't subject to it, but
  a web build of this app would fail.
- **No rate limiting anywhere**, and `/api/chat` reaches a model. Self-throttle.
- **No health endpoint**, so there is no cheap way to validate `EXPO_PUBLIC_API_URL`
  beyond an authenticated call.
- **HealthKit needs a dev build.** Expo Go cannot load it. The loop is
  `npx expo run:ios`, plus `expo-dev-client`, a HealthKit module, and the
  entitlement in `app.json` — none of which is set up yet.
- RunGuard is a **monitoring signal, not medical advice**. Never phrase anything
  the app displays as a diagnosis.
