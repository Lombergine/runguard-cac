# RunGuard — two sibling projects

- `website/` — the Next.js web app, the API, and the scoring engine. **Before
  writing code there, read `website/node_modules/next/dist/docs/`** — this
  version of Next.js has breaking changes versus training data.
- `app/` — the mobile client. Talks to the website over HTTP
  (`/api/mobile/*`, `Authorization: Bearer <device_token>`). It never connects
  to the database; credentials must not ship inside an app binary.

## Before writing any UI

Read [`docs/visual-spec.md`](docs/visual-spec.md). It defines the visual system
and six non-negotiables that override every aesthetic choice — chief among them
that safety-intercepted replies must be *structurally incapable* of rendering as
chat, and that a blank must never read as a healthy value.

## Running things

All npm commands run from inside `website/` or `app/`. There is no root
`package.json`.

Never run `npx tsx website/scripts/*.ts` from the repo root. `db.ts` resolves
the SQLite file from `process.cwd()`, so from the root it would silently
**create a new, empty database** at `./data/` and build the schema into it
rather than failing — the app would come up with an empty roster.

## Which database

Chosen explicitly by `DB_DRIVER`, never inferred from `NODE_ENV`:

| `DB_DRIVER` | Target | Use |
|---|---|---|
| unset or `sqlite` | `website/data/milemarker.db` | local dev — no credentials needed |
| `supabase` | Supabase Postgres over the pooler | deployment |

`DB_DRIVER=supabase` with no `DB_PASSWORD`/`DATABASE_URL` throws rather than
falling back to a local file. See `website/DEPLOY.md`.

## Safety

RunGuard is a monitoring signal, not medical advice — never phrase output as
diagnosis. `website/src/lib/safety.ts` intercepts crisis, purging and dosing
messages before the intent engine and before any model, and those exchanges are
tagged so they stay off the coach's screen. Do not route chat around that.

@website/AGENTS.md
