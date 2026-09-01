/**
 * Writes one risk_snapshots row per athlete per day — what the engine saw.
 *
 *   npx tsx scripts/snapshot.ts              # today only
 *   npx tsx scripts/snapshot.ts --backfill   # rebuild the last 120 days
 *   npx tsx scripts/snapshot.ts --backfill 200
 *   npx tsx scripts/snapshot.ts --all        # ignore the HealthKit gate
 *
 * The nightly job is NOT this script any more — it is the Vercel cron hitting
 * `/api/cron/snapshot`, which calls the same `runSnapshot()`. This stays as the
 * hand-run tool for backfills and for looking at what the engine sees.
 *
 * By default it applies the same HealthKit gate the cron does: an athlete whose
 * phone has delivered nothing in INGEST_WINDOW_DAYS is skipped. Pass `--all` to
 * snapshot the whole roster regardless, which is what you want against seeded
 * data, where every row shares one frozen `created_at` and nobody passes.
 */
import { runSnapshot } from "../src/lib/snapshot";
import { close, describeTarget } from "../src/lib/db";

const args = process.argv.slice(2);
const backfill = args.includes("--backfill");
const days = backfill ? Number(args[args.indexOf("--backfill") + 1]) || 120 : 1;

// main(), not top-level await: tsx transforms these scripts to CJS, where a
// top-level await is a hard transform error. The previous version of this file
// had one, which is why it could not be run at all.
async function main() {
  // Say which database before touching it. A backfill against the wrong target
  // is not something you want to discover from the row count afterwards.
  console.log(`Target: ${describeTarget()}`);

  const r = await runSnapshot({ days, requireIngest: !args.includes("--all") });

  console.log(
    `Wrote ${r.written} snapshot${r.written === 1 ? "" : "s"} for ${r.athletes} athletes ` +
      `(${backfill ? `backfill, ${days} days` : "today"}).`
  );
  if (r.skipped.length) {
    console.log(
      `Skipped ${r.skipped.length} with no recent HealthKit ingest: ${r.skipped.join(", ")}` +
        ` — pass --all to include them.`
    );
  }
  if (r.failed.length) {
    console.error(`FAILED for ${r.failed.length} athletes: ${r.failed.join(", ")}`);
  }

  // Without this the pooler's idle_timeout holds the process open ~20s past the
  // last query. See scripts/smoke.ts.
  await close();
  process.exit(r.failed.length ? 1 : 0);
}

main();
