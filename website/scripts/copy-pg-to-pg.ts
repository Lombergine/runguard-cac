/**
 * Copy one Supabase/Postgres database into another.
 *
 *   SRC_DB_URL=... DST_DB_URL=... npx tsx scripts/copy-pg-to-pg.ts        # dry run
 *   SRC_DB_URL=... DST_DB_URL=... npx tsx scripts/copy-pg-to-pg.ts --yes  # do it
 *
 * WHY THIS EXISTS ALONGSIDE migrate-to-pg.ts. That script copies the local
 * SQLite file into Postgres, which is the right tool when the local file is the
 * source of truth. It is not, between two deployed projects that have drifted:
 * at the time this was written the local file held 1,680 risk_snapshots and no
 * team_plan_days, while the deployed database held 0 and 14 — and the deployed
 * one carried a month of activity the local file had never seen. Copying
 * through SQLite would have silently picked a loser for every table.
 *
 * WHY NOT pg_dump. Two reasons, either sufficient. It is not installed on the
 * machine this was written for; and `pg_dump --data-only` emits a COPY with the
 * SOURCE's column list, so a target that has deliberately dropped a column —
 * teams.auth_user_id, in this schema — fails on restore. Intersecting the
 * columns is the whole point, and it is the same move migrate-to-pg.ts makes.
 *
 * CREDENTIALS COME FROM THE ENVIRONMENT AND ARE NEVER PRINTED. Both connection
 * strings open a database full of minors' health records. This script prints
 * hosts and row counts, never a URL, and its error paths print `e.message`
 * rather than the error object, because postgres.js attaches the connection
 * options — password included — to the thrown value.
 *
 * IT REPLACES THE TARGET. Every listed table is truncated before the copy. A
 * merge between two databases that both changed is not a thing a script can
 * decide, so this does not pretend to: --yes is required, and the dry run tells
 * you what is about to be destroyed as well as what is about to arrive.
 *
 * ALL OR NOTHING. Truncate, copy, sequence resets and the row-count check run in
 * ONE transaction on the target. A dropped connection on row 9,000 rolls the
 * whole thing back and leaves the target exactly as it was — the alternative,
 * learned the hard way in migrate-to-pg.ts, is a target left truncated and half
 * repopulated with no way back.
 */
import postgres from "postgres";
import type { Sql } from "postgres";

/** Parents before children — every FK points leftward. */
const TABLES = [
  "teams",
  "athletes",
  "races",
  "activities",
  "race_results",
  "checkins",
  "checkin_soreness",
  "injuries",
  "goals",
  "chat_messages",
  "workout_status",
  "health_metrics",
  "risk_snapshots",
  "team_plan_days",
  "waitlist",
] as const;

const CHUNK = 400;

function connect(which: "SRC" | "DST"): Sql {
  const url = process.env[`${which}_DB_URL`];
  if (!url) {
    throw new Error(
      `${which}_DB_URL is not set. Get it from Supabase → Connect → ` +
        `Transaction pooler, and export it in your shell rather than passing it ` +
        `on a command line, where it lands in your history.`
    );
  }
  // prepare:false is mandatory on port 6543: pgbouncer in transaction mode
  // cannot hold prepared statements across pooled connections.
  return postgres(url, { prepare: false, ssl: "require", idle_timeout: 20, max: 4 });
}

/** Host only — never the URL, which carries the password. */
function hostOf(url: string | undefined): string {
  try {
    return new URL(url!).host;
  } catch {
    return "(unparseable)";
  }
}

async function columnsOf(sql: Sql, table: string): Promise<Set<string>> {
  const rows = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ${table}`;
  return new Set(rows.map((r) => r.column_name));
}

async function countOf(sql: Sql, table: string): Promise<number> {
  const rows = await sql.unsafe(`SELECT COUNT(*)::int AS n FROM public.${table}`);
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0);
}

async function main() {
  const confirmed = process.argv.includes("--yes");
  const src = connect("SRC");
  const dst = connect("DST");

  console.log(`from: ${hostOf(process.env.SRC_DB_URL)}`);
  console.log(`to:   ${hostOf(process.env.DST_DB_URL)}\n`);

  if (hostOf(process.env.SRC_DB_URL) === hostOf(process.env.DST_DB_URL)) {
    throw new Error("Source and target are the same host. Refusing to truncate a database into itself.");
  }

  // Column intersection, per table, both directions checked.
  const plan: { table: string; cols: string[]; srcOnly: string[]; dstOnly: string[]; rows: number; had: number }[] = [];
  for (const table of TABLES) {
    const [sc, dc] = await Promise.all([columnsOf(src, table), columnsOf(dst, table)]);
    if (sc.size === 0) throw new Error(`source is missing table ${table}`);
    if (dc.size === 0) throw new Error(`target is missing table ${table} — apply supabase/migrations/0000_base_schema.sql first`);
    plan.push({
      table,
      cols: [...sc].filter((c) => dc.has(c)),
      srcOnly: [...sc].filter((c) => !dc.has(c)),
      dstOnly: [...dc].filter((c) => !sc.has(c)),
      rows: await countOf(src, table),
      had: await countOf(dst, table),
    });
  }

  const w = Math.max(...TABLES.map((t) => t.length));
  console.log(`  ${"table".padEnd(w)}  ${"source".padStart(7)}  ${"target".padStart(7)}`);
  for (const p of plan) {
    const notes = [
      p.srcOnly.length ? `not copied: ${p.srcOnly.join(",")}` : "",
      p.dstOnly.length ? `left null: ${p.dstOnly.join(",")}` : "",
    ].filter(Boolean).join("; ");
    console.log(
      `  ${p.table.padEnd(w)}  ${String(p.rows).padStart(7)}  ${String(p.had).padStart(7)}` +
        (notes ? `   ${notes}` : "")
    );
  }

  const incoming = plan.reduce((a, p) => a + p.rows, 0);
  const destroyed = plan.reduce((a, p) => a + p.had, 0);

  if (!confirmed) {
    console.log(`\nDRY RUN — nothing was changed.`);
    console.log(`Would REPLACE ${destroyed} rows in the target with ${incoming} rows from the source.`);
    console.log("Re-run with --yes. This cannot be undone.");
    await Promise.all([src.end(), dst.end()]);
    return;
  }

  // Read the source fully before opening the write transaction, so the target's
  // connection is not held open across a few thousand remote reads.
  console.log("\nreading source...");
  const data = new Map<string, Record<string, unknown>[]>();
  for (const p of plan) {
    const rows = p.cols.length
      ? ((await src.unsafe(
          `SELECT ${p.cols.join(", ")} FROM public.${p.table} ORDER BY 1`
        )) as unknown as Record<string, unknown>[])
      : [];
    data.set(p.table, rows);
  }
  await src.end();

  await dst.begin(async (tx) => {
    console.log("clearing target...");
    // One statement, so a CASCADE cannot leave the target partially cleared.
    await tx.unsafe(
      `TRUNCATE TABLE ${TABLES.map((t) => `public.${t}`).join(", ")} RESTART IDENTITY CASCADE`
    );

    for (const p of plan) {
      const rows = data.get(p.table)!;
      if (rows.length === 0) continue;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        // The placeholder number and the pushed value must stay in lockstep:
        // an off-by-one here inserts the right NUMBER of rows with the wrong
        // values in them, which no row-count check would catch. Hence one loop
        // that does both, rather than two that have to agree.
        const values: unknown[] = [];
        const tuples = chunk.map((r) => {
          const ph = p.cols.map((c) => {
            values.push(r[c] ?? null);
            return `$${values.length}`;
          });
          return `(${ph.join(", ")})`;
        });
        // OVERRIDING SYSTEM VALUE: every id is GENERATED ALWAYS, so an explicit
        // id is rejected without it — and renumbering would detach every FK.
        await tx.unsafe(
          `INSERT INTO public.${p.table} (${p.cols.join(", ")})
           OVERRIDING SYSTEM VALUE VALUES ${tuples.join(", ")}`,
          values as never[]
        );
      }
      console.log(`  ${p.table.padEnd(w)} ${String(rows.length).padStart(7)}`);
    }

    // RESTART IDENTITY left every sequence at 1, so the next insert would collide
    // with a copied id. setval's two-argument form marks the value as used.
    console.log("\nresetting identity sequences...");
    for (const p of plan) {
      if (!p.cols.includes("id")) continue;
      await tx.unsafe(
        `SELECT setval(pg_get_serial_sequence('public.${p.table}', 'id'),
                       GREATEST((SELECT COALESCE(MAX(id), 0) FROM public.${p.table}), 1))`
      );
    }

    // Verified INSIDE the transaction: a mismatch rolls the copy back rather
    // than reporting a bad database that has already replaced the good one.
    console.log("\nverifying...");
    const bad: string[] = [];
    for (const p of plan) {
      const got = await tx.unsafe(`SELECT COUNT(*)::int AS n FROM public.${p.table}`);
      const n = Number((got as unknown as { n: number }[])[0]?.n ?? 0);
      if (n !== p.rows) bad.push(`${p.table} (src=${p.rows} dst=${n})`);
      console.log(`  ${n === p.rows ? "ok " : "MISMATCH"} ${p.table.padEnd(w)} src=${p.rows} dst=${n}`);
    }
    if (bad.length) throw new Error(`row counts do not match, rolling back: ${bad.join(", ")}`);
  });

  await dst.end();
  console.log(`\nCopied ${incoming} rows. Target now matches the source.`);
}

main().catch(async (e) => {
  // e.message only. postgres.js hangs the connection options — password included
  // — off the error object, so printing it whole would leak the credential.
  console.error(`\nFAILED, target unchanged: ${e instanceof Error ? e.message : "unknown error"}`);
  process.exit(1);
});
