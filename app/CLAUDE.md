# RunGuard mobile app

Expo + TypeScript. Talks to `website/` over HTTP; never connects to a database.
See [`README.md`](README.md) for the API contract.

## Before writing any UI

**Read [`../docs/visual-spec.md`](../docs/visual-spec.md) first.** It is the
governing document for everything visual, and its six non-negotiables outrank
any aesthetic judgement. The ones most easily broken by accident:

- **A blank must never read as a healthy value.** `readiness` from the server is
  *always* a number and defaults to **100** when there is no check-in and no
  wearable data. Never render `profile.readiness` directly — go through
  `src/lib/readiness.ts`, which returns `{ known: false }` and makes the UI show
  `—  unknown`.
- **Absent / zero / no-run are three separate components**, not one component
  with a prop. Dashed means "we don't know", everywhere, with no exceptions.
- **Safety replies never touch the chat bubble component.** `SafetyNotice`
  shares no styles and no code path with `ChatBubble`.
- **A token is never rendered, never logged, and `signOut()` must clear every
  stored key, not just the token.** `lib/api.ts` deletes `athlete.deviceToken`
  from the response before any caller sees it; leaving a screen mounted with
  athlete data after sign-out is the same failure. See `../DEPLOY.md` →
  *Credentials*.
- **Units are welded to numbers** in a single text node. The API ships
  kilometres; every distance goes through `src/lib/units.ts`.
- **Dates are pre-formatted local strings** passed in as props. Components never
  derive a date.

## Conventions

- Routes live in `src/app/` (expo-router root is remapped there, so there is no
  `app/app/`).
- Design tokens are in `src/theme/` and are the single source — never hardcode a
  colour, size, or spacing value in a component.
- Body-part vocabulary mirrors `website/src/lib/bodyParts.ts`. Run
  `npm run check:bodyparts` — it fails if the two drift.
