/**
 * One-off copy of the local SQLite database into Supabase.
 *
 *   DB_DRIVER=supabase DB_PASSWORD=... npx tsx scripts/migrate-to-pg.ts --yes
 *
 * REPLACES everything in the target: the Supabase copy predates the 2026-08-01
 * scoring work and has drifted independently since, so merging the two would
 * produce a database matching neither. Requires --yes for that reason.
 *
 * Ids are preserved, which is the whole difficulty. Every id column in Supabase
 * is GENERATED ALWAYS AS IDENTITY and therefore rejects an explicit value unless
 * the insert says OVERRIDING SYSTEM VALUE; without that the copy would renumber
 * every row and silently detach every foreign key. The identity sequences are
 * reset afterwards so the next insert does not collide with a copied id.
 *
 * Tables are copied parents-first. Columns are intersected with the target, so
 * columns that exist only in Supabase (activities.route, teams.auth_user_id,
 * both from the other repo lineage) are simply left null.
 *
 * ALL OR NOTHING. The clear, the copy, the sequence resets and the row-count
 * check run in one transaction. Anything that fails — a dropped connection
 * mid-copy, a constraint violation on row 9,000, a count that does not match —
 * rolls the whole thing back and leaves the target exactly as it was. Without
 * that, a failure halfway through left production truncated and half
 * repopulated, with no way back except re-running the script.
 */
import Database from "better-sqlite3";
import path from "path";
import { all, driver, describeTarget, close, transaction } from "../src/lib/db/driver";

// parents before children — FKs point leftward
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
  // After risk_snapshots so the FK to teams is already satisfied — TABLES is
  // copied in order and teams is first.
  "team_plan_days",
  "waitlist",
] as const;

const CHUNK = 400;

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error(
      "Refusing to run without --yes. This REPLACES all data in the target database."
    );
    process.exit(1);
  }
  if (driver() !== "supabase") {
    console.error("Set DB_DRIVER=supabase — this script only writes to Postgres.");
    process.exit(1);
  }

  const srcPath =
    process.env.DATABASE_PATH || path.join(process.cwd(), "data", "milemarker.db");
  const src = new Database(srcPath, { readonly: true });
  console.log(`from: sqlite:${srcPath}`);
  console.log(`to:   ${describeTarget()}\n`);

  // Target columns, so we only copy what both sides have.
  const targetCols = new Map<string, Set<string>>();
  for (const t of TABLES) {
    const rows = await all<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = ?",
      [t]
    );
    targetCols.set(t, new Set(rows.map((r) => r.column_name)));
  }

  const missing = TABLES.filter((t) => targetCols.get(t)!.size === 0);
  if (missing.length) {
    console.error(`Target is missing tables: ${missing.join(", ")}`);
    console.error("Apply supabase/migrations/ first.");
    process.exit(1);
  }

  // Read the source before opening the transaction, so the write connection is
  // not held open for the length of a few thousand SQLite reads.
  const source = TABLES.map((table) => {
    const rows = src.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
    const srcColsAll = rows.length ? Object.keys(rows[0]) : [];
    return {
      table,
      rows,
      cols: srcColsAll.filter((c) => targetCols.get(table)!.has(c)),
      dropped: srcColsAll.filter((c) => !targetCols.get(table)!.has(c)),
    };
  });
  src.close();

  const summary: { table: string; rows: number; skipped: string }[] = [];

  // Everything below either all lands or none of it does.
  await transaction(async (tx) => {
    // One statement so the CASCADE cannot leave a partially-cleared database.
    console.log("clearing target...");
    await tx.run(
      `TRUNCATE TABLE ${TABLES.map((t) => `public.${t}`).join(", ")} RESTART IDENTITY CASCADE`
    );

    for (const { table, rows, cols, dropped } of source) {
      if (rows.length === 0) {
        summary.push({ table, rows: 0, skipped: "" });
        continue;
      }

      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const values: unknown[] = [];
        const tuples = chunk.map((r) => {
          const ph = cols.map(() => "?").join(", ");
          for (const c of cols) values.push(r[c] ?? null);
          return `(${ph})`;
        });
        // OVERRIDING SYSTEM VALUE: id is GENERATED ALWAYS, so an explicit id is
        // rejected without it, and every foreign key would break.
        await tx.run(
          `INSERT INTO public.${table} (${cols.join(", ")})
           OVERRIDING SYSTEM VALUE VALUES ${tuples.join(", ")}`,
          values
        );
      }

      summary.push({ table, rows: rows.length, skipped: dropped.join(",") });
      console.log(`  ${table.padEnd(18)} ${String(rows.length).padStart(6)}`);
    }

    // Identity sequences still sit at 1 after RESTART IDENTITY, so the next
    // insert would collide with a copied id. setval's two-argument form marks
    // the value as already used, so nextval returns MAX(id)+1.
    console.log("\nresetting identity sequences...");
    for (const table of TABLES) {
      if (!targetCols.get(table)!.has("id")) continue;
      await tx.run(
        `SELECT setval(pg_get_serial_sequence('public.${table}', 'id'),
                       GREATEST((SELECT COALESCE(MAX(id), 0) FROM public.${table}), 1))`
      );
    }

    // Verified INSIDE the transaction on purpose: a mismatch now throws, which
    // rolls the copy back instead of reporting a bad database that has already
    // replaced the good one.
    console.log("\nverifying row counts...");
    const bad: string[] = [];
    for (const { table, rows } of summary) {
      const got = await tx.all<{ n: number }>(`SELECT COUNT(*)::int AS n FROM public.${table}`);
      const n = Number(got[0]?.n ?? 0);
      const ok = n === rows;
      if (!ok) bad.push(`${table} (sqlite=${rows} pg=${n})`);
      console.log(`  ${ok ? "ok " : "MISMATCH"} ${table.padEnd(18)} sqlite=${rows} pg=${n}`);
    }
    if (bad.length) {
      throw new Error(`row counts do not match, rolling back: ${bad.join(", ")}`);
    }
  });

  const skipped = summary.filter((s) => s.skipped);
  if (skipped.length) {
    console.log("\ncolumns present in sqlite but not in the target (left out):");
    for (const s of skipped) console.log(`  ${s.table}: ${s.skipped}`);
  }

  await close();
  console.log("\nMigration complete.");
  process.exit(0);
}

main().catch(async (e) => {
  // The transaction has already rolled back by the time this runs — the target
  // still holds whatever it held before the script started.
  console.error(`\nMigration FAILED, target unchanged:\n  ${e instanceof Error ? e.message : e}`);
  await close().catch(() => {});
  process.exit(1);
});
