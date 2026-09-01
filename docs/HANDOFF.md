# Handoff — the iOS app

Written 2026-08-31. Everything below is the state of the `app/` half of the
repo. The `website/` half is being worked on separately and is not covered here.

## Get it running

Two servers and a simulator. Nothing else.

```bash
cd website && npm run dev        # localhost:3000 — the API and the web app
cd app && npx expo start         # localhost:8081 — Metro
```

Then launch the app on a booted simulator:

```bash
xcrun simctl boot "iPhone 17" && open -a Simulator
xcrun simctl launch booted run.runguard.app
```

The app is already built and installed on the simulator with its native
dependencies. You only need `npx expo run:ios` again if you add a package with
native code — `expo-blur` was the last one.

**Which database.** `DB_DRIVER=supabase` in `website/.env.local`, pointing at the
**runguard-dev** project. Production (`frREALRUNGUARDfr`) is a different project
and nothing here touches it. Set `DB_DRIVER=sqlite` (or unset it) for a local
file instead — see the table in the root `CLAUDE.md`.

## Signing in without typing a password

`app/.env` holds `EXPO_PUBLIC_DEV_TOKEN`. If it is set, the app signs in with it
when the keychain is empty. It works for **either role** — `auth.ts` reads which
from the token's own shape, so switching the simulator between the athlete tabs
and the coach tabs is one line of that file.

To mint one (from inside `website/`, never the repo root):

```bash
npx tsx --env-file=.env.local scripts/… athlete 4    # Ethan Park
npx tsx --env-file=.env.local scripts/… coach 1      # Leland XC
```

There is no committed script for this — it lived in a scratch directory. It is
six lines: read the row, call `signAthleteToken(id, row.token_version)` or
`signTeam(id, team.token_version)`, write the line into `app/.env`. Worth
committing if you find yourself doing it twice.

**If the app suddenly 401s everywhere, the token is stale.** Tokens now carry the
row's `token_version`, so anything that bumps a version invalidates tokens minted
before it. Re-mint and restart Metro — the value is inlined at bundle time, so a
fast refresh will not pick it up.

Metro must also be restarted for any `app/.env` change, for the same reason.

## What is in the app

Five athlete tabs — Today, Training, Stats, Recovery, Races — and three coach
tabs: Roster, Calendar, Sources. Which set you get is decided at runtime from
the stored credential (`(tabs)/_layout.tsx`, `Tabs.Protected`).

Two things worth knowing before you change anything:

**Read `docs/visual-spec.md` first.** Six non-negotiables that outrank every
aesthetic choice. The two easiest to break by accident: a blank must never read
as a healthy value (readiness defaults to 100 server-side — always go through
`lib/readiness.ts`), and absent / zero / no-run are three separate components,
never one with a prop.

**`docs/design-port.md` is the ledger.** 47 rows, every place the app
deliberately differs from the Claude design study, with the reason. The bar it
is held to is stated at the top: match the design unless a non-negotiable or a
measured contrast floor makes it impossible. If you differ from the design, add
a row; if a row's reason no longer holds, strike it through rather than deleting
it.

**All tokens live in `app/src/theme/`.** Never hardcode a colour, size or spacing
in a component — `app/CLAUDE.md` says so and it is enforced by review, not by
lint. Colours are `DynamicColorIOS` pairs the OS resolves at paint time, which
is how dark mode reaches ~100 static stylesheets without a hook.

## Two feature flags

| Where | What |
|---|---|
| `app/src/app/chat.tsx` → `CHAT_ENABLED = false` | The AI chat is built but not released. Demos show a fixed example transcript (`lib/demoChat.ts`); everyone else gets a "Not available yet" panel and an inert composer. Flip the constant to turn it on. |
| `website/.env.local` → `DEMO_TEAM_ID` | Set, so the demos work. Unset it and both demo rows disappear from the welcome screen rather than failing. |

## Known state

- **Both projects typecheck clean.** `npx tsc --noEmit` in `app/` and `website/`.
- **`app` lint is 13 problems** — all pre-existing, none in recently written
  code. Treat 13 as the baseline: if a change makes it 14, that one is yours.
- **A production export succeeds**, ~3.2 MB, and contains no dev token.

## Not done

Small and written down rather than hidden:

- The **demo chat transcripts** and the **Settings → Appearance toggle** were
  never tapped on a device — this machine has no simulator tap automation. Both
  typecheck and their code paths are short, but they deserve two minutes of
  manual tapping.
- **Run detail has no Splits section** — the data is not on the wire.
- **Signup has no Athlete/Coach role picker** — coach accounts are made on the
  web, where the team and join code are set up.
- **No Forgot password** in the app. (The website is growing one separately.)
- Ledger rows 43–47 cover these with the full reasoning.

## One real problem, not in the app

`auth_attempts` in Supabase is `anon`-readable and writable with RLS off, and it
holds emails and IP addresses. It is created at runtime, which is why it never
got `ENABLE ROW LEVEL SECURITY`. This is the only item in this document with a
security edge and it is worth doing before anyone else uses the dev project.

## Git

- **`origin`** → `runguard663-ui/frREALRUNGUARDfr` — the working repo, wired to
  Vercel. Branches track it.
- **`upstream`** → `RealRunGuard/REALRUNGUARD` — the original. None of this work
  is on it.
- Current branch: **`supabase-account-move`**. It has not been merged to `main`.

**Commit as yourself.** The one exception: a commit you specifically want Vercel
to build needs the `runguard663-ui` identity, because Vercel refuses to build a
commit whose email it cannot match to a GitHub account with project access:

```bash
git -c user.name="runguard663-ui" -c user.email="runguard663@gmail.com" commit -m "…"
```

Never set that globally or repo-locally.
