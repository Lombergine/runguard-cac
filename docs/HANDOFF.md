# Handoff

Written 2026-08-31. Read this before touching anything — it is the shortest path
to being useful, and the fastest way to avoid the four traps that have already
cost time.

---

## 1. What this is

RunGuard watches a high-school distance runner's training load and tells their
coach who needs a lighter day — before practice, rather than after an injury. It
is **two projects in one repo**, with different jobs and different rules.

**`website/`** — Next.js 16. Three things at once: the coach's web dashboard,
the athlete's web view, and **the API the phone talks to**. It owns the only
database connection in the product, and the scoring engine (`src/lib/risk.ts`,
`engine.ts`, `profile.ts`) — ACWR, readiness, the pre-practice flags.

**`app/`** — the Expo / React Native iOS app. It talks to `website/` over HTTP
at `/api/mobile/*` with `Authorization: Bearer <token>`. **It never connects to
a database.** That is deliberate: database credentials must not ship inside an
app binary, because a binary is a file on someone else's phone that can be
unzipped.

There is no root `package.json`. Every npm command runs from inside `website/`
or `app/`.

### Three documents govern any change

Read them in this order and treat them as outranking your own taste:

1. **`docs/visual-spec.md`** — six non-negotiables for anything visual. The two
   most easily broken by accident: *a blank must never read as a healthy value*
   (readiness comes back as `100` when nothing is known, so never render
   `profile.readiness` directly — go through `app/src/lib/readiness.ts`), and
   *absent / zero / no-run are three separate components*, never one component
   with a prop. Dashed means "we don't know", everywhere, no exceptions.
2. **`docs/design-port.md`** — a 47-row ledger of every place the app
   deliberately differs from the Claude design study, each with its reason. The
   bar is stated at the top: match the design unless a non-negotiable or a
   *measured contrast floor* makes it impossible. If you differ, add a row. If a
   row's reason stops holding, strike it through rather than delete it — the
   history of why is the useful part.
3. **`app/CLAUDE.md`** and **`website/AGENTS.md`**. The website one matters more
   than it looks: **this is not the Next.js you know.** Read
   `website/node_modules/next/dist/docs/` before writing anything there; this
   version has breaking changes against what most people (and most models)
   remember.

### Safety

`website/src/lib/safety.ts` intercepts crisis, purging and dosing messages
**before** the intent engine and before any model, and tags those exchanges so
they stay off the coach's screen. Do not route chat around it. RunGuard is a
monitoring signal, never a diagnosis — nothing may be phrased as medical advice.

---

## 2. Getting it running

Three things: the API, the bundler, the simulator.

```bash
cd website && npm run dev      # localhost:3000 — API + web app
cd app && npx expo start       # localhost:8081 — Metro
```

```bash
xcrun simctl boot "iPhone 17" && open -a Simulator
xcrun simctl launch booted run.runguard.app
```

The app is **already built and installed** on the simulator with its native
modules. You only need `npx expo run:ios` again if you add a package containing
native code — `expo-blur` was the last one, and that rebuild takes ten minutes.

Deep links are the fastest way around while developing:
`xcrun simctl openurl booted 'runguard://recovery'`, and likewise
`runguard://settings`, `runguard://chat`, `runguard://roster`.

---

## 3. Environment variables

Neither `.env` is committed. Both projects ship a `.env.example` listing every
key with a comment — copy it to `.env.local` (website) or `.env` (app) and fill
it in. The examples are the source of truth; below is *why* each exists.

### `website/.env.local`

**Database — one shape or the other, not both.**

| Key | What it is |
|---|---|
| `DB_DRIVER` | `sqlite` or unset → a local file at `website/data/milemarker.db`, no credentials needed. `supabase` → Postgres over the pooler. |
| `DATABASE_URL` | The whole pooler connection string. What we actually use. |
| `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME` | The piece-by-piece alternative. Either form works. |

The driver is chosen **explicitly and never inferred from `NODE_ENV`**.
`DB_DRIVER=supabase` with no password *throws* rather than quietly falling back
to a local file — a silent fallback is how you end up demoing an app that comes
up with an empty roster and not knowing why.

**Sessions.**

| Key | What it is |
|---|---|
| `SESSION_SECRET` | HMAC key for every session token, athlete and coach. Rotating it invalidates every token everywhere, which is the intended emergency lever. |

Locally, when `DB_DRIVER` is not `supabase`, this falls back to a public dev
secret. Against Supabase it must be set and the code refuses to start without
it: signing sessions with a secret anyone can read, against rows other people
can also read, is worth crashing over.

**The demo.**

| Key | What it is |
|---|---|
| `DEMO_TEAM_ID` | Which team the public demo opens. Currently `1`, Leland XC. Unset it and both demo rows vanish from the app's welcome screen rather than failing. |
| `DEMO_ATHLETE_ID` | Which athlete the athlete demo opens. Currently `11`. |

**Standing condition: the demo team must contain only seeded data.** A demo
token is a real credential for a real team, and the *coach* demo token reads the
whole roster. The moment a real runner joins team 1, every visitor is reading a
real minor's health record. Nothing in code can check this.

**Everything else.**

| Key | What it is |
|---|---|
| `COACH_PASSWORD` | A shared coach password, refused whenever `DB_DRIVER` is not sqlite. Local convenience only. |
| `NEXT_PUBLIC_SITE_URL` | Absolute origin, used in emails and OAuth redirects. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_IOS_CLIENT_ID` | Google sign-in. From in-flight work; unset means those routes 503 rather than break. |
| `RESEND_API_KEY`, `MAIL_FROM` | Transactional email for password reset. Same: unset → 503. |
| `CRON_SECRET` | Shared secret the daily snapshot cron presents. |

### `app/.env`

| Key | What it is |
|---|---|
| `EXPO_PUBLIC_API_URL` | Where the phone finds the API. `http://localhost:3000` is right for the **simulator**, which shares the Mac's loopback. On a **physical phone** `localhost` is the phone — use the LAN address `npx expo start` prints, or every request hangs 15 seconds and reports the server unreachable. |
| `EXPO_PUBLIC_DEV_TOKEN` | Skips the sign-in screen. See §4. |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google sign-in on iOS. |

**Two things about `EXPO_PUBLIC_*` that will bite you.** Expo inlines these at
**bundle time** by textual substitution — so a computed lookup like
`process.env[name]` returns `undefined` (always write the static dot path), and
**editing the file does nothing until Metro restarts.** A fast refresh will not
pick it up.

---

## 4. The dev token

`EXPO_PUBLIC_DEV_TOKEN` lets a dev build sign in without typing an email and
password: `app/src/lib/auth.ts` sends it as the Bearer when the keychain is
empty. It is gated on `__DEV__`, a compile-time constant, so the expression
folds to `null` in a release bundle and the value never reaches shipped
JavaScript — otherwise a release build made on a machine with the variable set
would bake a live session for a real athlete into the binary.

It works for **either role**. `auth.ts` reads which from the token's own shape,
so moving between the five athlete tabs and the three coach tabs is one line:

```bash
cd website
npx tsx --env-file=.env.local scripts/dev-token.ts athlete 4   # Ethan Park
npx tsx --env-file=.env.local scripts/dev-token.ts coach 1     # Leland XC
```

One variable rather than two on purpose: two would mean an athlete and a coach
credential present at once, which `getCredential()` refuses outright rather than
guessing which to send.

**When the app 401s on everything at once, this is why.** Tokens carry the row's
`token_version`, so anything that bumps a version — a password reset, a
revocation — invalidates every token minted before it. Re-run the script, then
restart Metro. This has already happened once.

Run it from inside `website/`, never the repo root: `db.ts` resolves the SQLite
path from `process.cwd()`, so from the root it would silently create a **new
empty database** and build the schema into it rather than failing.

---

## 5. Databases

Two Supabase projects, genuinely separate — verified by creating a team in one
and confirming it did not appear in the other.

| | Project | Ref |
|---|---|---|
| **Dev** | `runguard-dev` | `mwwhgnrdownzbnwmbsgi` |
| **Prod** | `frREALRUNGUARDfr` | `xgcxfvsezsfxdujzjexd` |

Local development and Vercel Preview both point at **dev**. Production points at
prod. Nothing in normal development touches production.

Connections go over the **transaction pooler on port 6543** with
`prepare: false` — the pooler does not support prepared statements, and leaving
them on produces intermittent failures that look like network flakiness.

Migrations are plain SQL in `website/supabase/migrations/`, `0000` through
`0009`, additive by convention. `0005` drops Strava, which was removed from the
product entirely: if you find a Strava reference anywhere, it is dead.

---

## 6. Vercel

**Team** `runguard` · **Project** `runguard` · **Root directory** `website` ·
**Framework** Next.js · **Node** 24.x

### Environments

Three, with different variable sets:

- **Development** — `DB_DRIVER`, `DATABASE_URL`, `SESSION_SECRET`,
  `DEMO_TEAM_ID`, `DEMO_ATHLETE_ID`, `COACH_PASSWORD`, `OLLAMA_BASE_URL`,
  `OLLAMA_MODEL`. This set exists so a collaborator can run
  `vercel env pull .env.local` and have a working local setup without anyone
  emailing credentials around.
- **Preview** — `DB_DRIVER`, `DATABASE_URL`, `SESSION_SECRET`, pointing at the
  **dev** database. Deliberate: a preview deploy of a branch must never be able
  to write production rows.
- **Production** — the same three, plus sixteen `POSTGRES_*` / `SUPABASE_*`
  variables the Supabase integration added automatically. Most are unused by
  this codebase, which reads `DATABASE_URL`. Harmless, but do not assume they
  are load-bearing.

Pull them locally with `cd website && npx vercel env pull .env.local`.

### Two traps that have already cost time

**`.vercelignore` replaces `.gitignore`, it does not add to it.** The repo root
`.gitignore` sits *above* the deployment root (`website/`), so Vercel never
consults it. Without `website/.vercelignore` listing `node_modules`, `.next`,
`data` and `.env*` explicitly, a deploy uploads about **1.6 GB** and stalls;
with it, 155 KB. The file is committed and carries this explanation at the top —
do not "tidy" it.

**Commits must be authored `runguard663-ui` to build.** Vercel refuses to build
a commit whose email it cannot match to a GitHub account with project access:
the deployment sits at status `UNKNOWN` forever with no build logs and the
message *"the commit email tiwa.prani@gmail.com could not be matched to a GitHub
account."* `runguard663@gmail.com` is the verified address on `runguard663-ui`,
the account the Vercel team authenticates as. `tiwa.prani@gmail.com` is already
used on a different GitHub account so it cannot be added, and **turning off
"Require Verified Commits" does not clear it** — that was tried.

```bash
git -c user.name="runguard663-ui" -c user.email="runguard663@gmail.com" commit -m "…"
```

Use `-c`, not `--author`: `--author` sets only the author and leaves the
committer as you, and it is not established which of the two Vercel inspects.
Vercel reads the **HEAD commit** of what you push, so fixing config afterwards
changes nothing — amend and `push --force-with-lease`.

**Everything else commits as yourself.** Never set that identity globally or
repo-locally.

### Deployments

All current deployments are **Preview**; there is no production alias yet. A
push to a branch creates a preview automatically. `vercel.json` also registers a
daily cron at 10:00 UTC hitting `/api/cron/snapshot`, which belongs to in-flight
snapshot work rather than to the app.

---

## 7. What was done, and why

The large moves on this branch. The *why* is the part that does not survive in a
diff.

**Device tokens are gone.** Athletes used to authenticate with
`athletes.device_token` — `dt_` plus 40 hex, never expiring, unrevokable, and
the entire credential for a minor's health data. It had to be *displayed* on one
screen and *typed* into another, which is a credential that gets screenshotted
and read aloud across a track. It is replaced by a signed session token from an
ordinary email-and-password sign-in. The column, the pairing screen and
`/api/athlete/rotate-token` are all deleted. `auth.ts` still lists the old key so
signing out erases it from phones upgrading over an older build.

**The coach role exists on the phone.** Roster, Calendar, Sources and an athlete
detail screen, behind `Tabs.Protected guard={coach}`. The calendar **writes**,
and deliberately shares the web form's validator
(`website/src/lib/teamPlan.ts`) rather than having its own — two writers with
two validators is how one client stores a day the other would have refused, and
the athlete sees whichever won. Miles on the wire, metres in the column,
converted server-side.

**One `TabScreen` frame for every tab.** Three tabs had lost their header
because `ScreenHeader` was mounted inside each screen's state switch and two
branches forgot it. Now a screen hands its states to `children` and *cannot*
render one without its chrome. The scroller and pull-to-refresh live there too.

**The design pass.** Type ranks, hairline width, page padding and the tab bar
were brought to the design study's own values, and `expo-blur` was installed so
the nav and tab bars are genuinely translucent. Where the app still differs,
`docs/design-port.md` says why.

**The chat is built but switched off.** `CHAT_ENABLED = false` in
`app/src/app/chat.tsx`. It reaches a model, and that is not a thing to turn on
quietly. Demos show a fixed example transcript, labelled as an example; everyone
else gets a "Not available yet" panel and an inert composer. A constant rather
than an env var on purpose — an env var can differ between a build and a review
build, and *"did the AI answer a teenager during App Review"* is not a question
to leave to configuration.

**Dark mode is a real preference.** Settings → Display → Appearance cycles
Follow phone / Light / Dark. It works via `Appearance.setColorScheme()` rather
than a React context, because every colour is a `DynamicColorIOS` pair the OS
resolves at paint time — a context cannot reach those. Stored outside `auth.ts`'s
erase list so signing out does not flip a shared team phone back to light
between athletes.

---

## 8. What is left

**On this branch.** 36 commits ahead of `main`, not merged.

**Never tapped on a device.** The demo chat transcripts and the Appearance
toggle. Both typecheck and their code paths are short, but this machine has no
simulator tap automation, so they deserve two minutes of manual tapping.

**Known gaps, all in the ledger (rows 43–47).** Run detail has no Splits section
— the data is not on the wire. Signup has no Athlete/Coach role picker — coach
accounts are made on the web, where the team and join code are set up. There is
no Forgot password in the app; the website is growing one separately.

**Baselines to hold.** Both projects typecheck clean. `app` lint is **13
problems**, all pre-existing — if a change makes it 14, that one is yours. A
production export succeeds at ~3.2 MB and contains no dev token; worth
re-checking before any release build.

**Loose ends elsewhere.** `driver.ts` still names a retired Supabase project in
a fallback. `.env.migrate` still holds passwords from the account move. Next
warns `middleware` → `proxy` on every boot. None of these break anything today.

---

## 9. Git

- **`origin`** → `runguard663-ui/frREALRUNGUARDfr` — the working repo, wired to
  Vercel. Branches track it.
- **`upstream`** → `RealRunGuard/REALRUNGUARD` — the original. None of this work
  is on it. The GitHub App is installed only there, so tooling that reads repo
  contents may see `upstream` and not `origin`.
- Current branch: **`supabase-account-move`**.

**If two people are in this repo at once:** `git add -A` will sweep up whatever
the other has half-finished. It has already happened in both directions. Stage
explicit paths, or work in a git worktree.
