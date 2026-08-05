/**
 * The only file that knows which database is in play.
 *
 * TWO DRIVERS, chosen by DB_DRIVER:
 *   unset / "sqlite"  → local file at DATABASE_PATH (data/milemarker.db). The
 *                       testing target: no network, no credentials, no setup.
 *   "supabase"        → Postgres over Supabase's transaction pooler, needs
 *                       DB_PASSWORD. The deployment target.
 *
 * WHY AN EXPLICIT SWITCH rather than keying off NODE_ENV. NODE_ENV is set
 * implicitly by whichever npm script ran, so it is always "development" on a dev
 * machine — the Supabase path would be unreachable without a production build,
 * and which database received a write would be decided by something nobody wrote
 * down. An explicit variable means `DB_DRIVER=supabase npm run dev` tests real
 * writes with hot reload still working. Same argument as COACH_PROVIDER for the
 * model: a condition that was never meant to route data should not route data.
 *
 * WHY IT FAILS CLOSED. DB_DRIVER=supabase with no credentials throws instead of
 * quietly falling back to SQLite. On a serverless host that fallback would write
 * athlete data to a container file that vanishes on the next deploy, while every
 * health check kept passing.
 *
 * WHY THE QUERIES ARE NOT WRITTEN TWICE. The bundled SQLite is 3.53.3, which
 * supports RETURNING and ON CONFLICT with the same syntax Postgres uses, so
 * db.ts keeps one copy of each statement. Only three things actually differ, and
 * all three are handled here: placeholder style, sync vs async, and the schema
 * DDL (which lives per-driver — see schema.sqlite.ts and supabase/migrations).
 */
import Database from "better-sqlite3";
import postgres from "postgres";
import type { Sql } from "postgres";
import fs from "fs";
import path from "path";
import { applySqliteSchema } from "./schema.sqlite";

export type Driver = "sqlite" | "supabase";

/** Positional (`?`) or named (`@name`) — db.ts uses both. */
export type Params = readonly unknown[] | Record<string, unknown>;

const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "milemarker.db");

declare global {
  // eslint-disable-next-line no-var
  var __mmdb: Database.Database | undefined;
  // eslint-disable-next-line no-var
  var __mmpg: Sql | undefined;
}

export function driver(): Driver {
  const d = process.env.DB_DRIVER ?? "sqlite";
  if (d === "sqlite" || d === "supabase") return d;
  throw new Error(
    `DB_DRIVER="${d}" is not a valid driver. Use "sqlite" (default) or "supabase".`
  );
}

/** Human-readable target, for startup logging and the smoke script. */
export function describeTarget(): string {
  if (driver() === "sqlite") return `sqlite:${DB_PATH}`;
  const host = process.env.DB_HOST || "aws-0-ca-central-1.pooler.supabase.com";
  return `supabase:${host}:${process.env.DB_PORT || 6543}`;
}

/* ---------------- sqlite ---------------- */

function sqlite(): Database.Database {
  if (global.__mmdb) return global.__mmdb;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  applySqliteSchema(db);
  global.__mmdb = db;
  return db;
}

/* ---------------- postgres ---------------- */

function pg(): Sql {
  if (global.__mmpg) return global.__mmpg;

  const password = process.env.DB_PASSWORD;
  const url = process.env.DATABASE_URL;
  if (!password && !url) {
    throw new Error(
      "DB_DRIVER=supabase but neither DB_PASSWORD nor DATABASE_URL is set. " +
        "Refusing to start rather than silently writing to a local file that a " +
        "deploy would erase. Set it in Vercel → Settings → Environment Variables."
    );
  }

  // prepare:false is mandatory: port 6543 is pgbouncer in transaction mode and
  // cannot hold prepared statements across pooled connections.
  const opts = { prepare: false as const, ssl: "require" as const, idle_timeout: 20 };

  const client = url
    ? postgres(url, opts)
    : postgres({
        host: process.env.DB_HOST || "aws-0-ca-central-1.pooler.supabase.com",
        port: Number(process.env.DB_PORT || 6543),
        username: process.env.DB_USER || "postgres.lmhxdnqxtecwogmnrdxg",
        password,
        database: process.env.DB_NAME || "postgres",
        ...opts,
      });

  // Cached on global for the same reason the SQLite handle is: without it,
  // Next.js HMR opens a fresh connection pool on every reload.
  global.__mmpg = client;
  return client;
}

/**
 * Rewrite SQLite's placeholder styles into Postgres' $n, returning the values in
 * matching order. Both forms are supported because db.ts uses both — the
 * 19-parameter snapshot upsert is far less error-prone named than positional.
 *
 * Quoted literals and `--` comments are stepped over so a `?` or `@` inside one
 * is never mistaken for a placeholder.
 */
export function toPg(sql: string, params: Params): { text: string; values: unknown[] } {
  const bag = (Array.isArray(params) ? {} : params) as Record<string, unknown>;
  const arr = (Array.isArray(params) ? params : []) as readonly unknown[];
  const values: unknown[] = [];
  let out = "";
  let i = 0;
  let pos = 0;

  while (i < sql.length) {
    const c = sql[i];

    if (c === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") {
          j++;
          break;
        }
        j++;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }

    if (c === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      const end = nl === -1 ? sql.length : nl;
      out += sql.slice(i, end);
      i = end;
      continue;
    }

    if (c === "?") {
      values.push(arr[pos++] ?? null);
      out += "$" + values.length;
      i++;
      continue;
    }

    if (c === "@") {
      const m = /^@([A-Za-z_][A-Za-z0-9_]*)/.exec(sql.slice(i));
      if (m) {
        values.push(bag[m[1]] ?? null);
        out += "$" + values.length;
        i += m[0].length;
        continue;
      }
    }

    out += c;
    i++;
  }

  return { text: out, values };
}

/** better-sqlite3 takes an array or a named object as the sole argument. */
function bind(params: Params): [Params] | [] {
  if (Array.isArray(params) && params.length === 0) return [];
  return [params];
}

/* ---------------- the interface db.ts uses ---------------- */

export async function all<T>(sql: string, params: Params = []): Promise<T[]> {
  if (driver() === "sqlite") {
    return sqlite().prepare(sql).all(...bind(params)) as T[];
  }
  const { text, values } = toPg(sql, params);
  return (await pg().unsafe(text, values as never[])) as unknown as T[];
}

export async function one<T>(sql: string, params: Params = []): Promise<T | undefined> {
  if (driver() === "sqlite") {
    return sqlite().prepare(sql).get(...bind(params)) as T | undefined;
  }
  const { text, values } = toPg(sql, params);
  const rows = (await pg().unsafe(text, values as never[])) as unknown as T[];
  return rows[0];
}

/** Returns the number of rows affected. */
export async function run(sql: string, params: Params = []): Promise<number> {
  if (driver() === "sqlite") {
    return sqlite().prepare(sql).run(...bind(params)).changes;
  }
  const { text, values } = toPg(sql, params);
  const res = await pg().unsafe(text, values as never[]);
  return res.count ?? 0;
}

/** Column names for a table, however the current driver exposes them. */
export async function columns(table: string): Promise<string[]> {
  if (driver() === "sqlite") {
    // PRAGMA cannot take a bound parameter, hence the identifier check.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new Error(`bad table name: ${table}`);
    const rows = sqlite().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return rows.map((r) => r.name);
  }
  const rows = await all<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?",
    [table]
  );
  return rows.map((r) => r.column_name);
}

/**
 * Raw SQLite handle — for scripts/seed.ts alone.
 *
 * Seeding wipes and rebuilds the demo team, and resets sqlite_sequence, which has
 * no Postgres equivalent. It is also not an operation that should ever be pointed
 * at a shared database, so this throws rather than growing a Postgres path: to get
 * demo data into Supabase, seed locally and run scripts/migrate-to-pg.ts.
 */
export function sqliteOnlyHandle(): Database.Database {
  if (driver() !== "sqlite") {
    throw new Error(
      "This script only runs against the local SQLite file. Unset DB_DRIVER " +
        "(or set DB_DRIVER=sqlite). To populate Supabase, use scripts/migrate-to-pg.ts."
    );
  }
  return sqlite();
}

/** Close pooled connections. Scripts need this to exit; the app never calls it. */
export async function close(): Promise<void> {
  if (global.__mmpg) {
    await global.__mmpg.end();
    global.__mmpg = undefined;
  }
  if (global.__mmdb) {
    global.__mmdb.close();
    global.__mmdb = undefined;
  }
}
