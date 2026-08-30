/**
 * Erase one athlete and everything derived from them.
 *
 *   npx tsx scripts/delete-athlete.ts --email runner@school.org        # dry run
 *   npx tsx scripts/delete-athlete.ts --email runner@school.org --yes  # do it
 *   DB_DRIVER=supabase DB_PASSWORD=… npx tsx scripts/delete-athlete.ts --id 7 --yes
 *
 * WHY THIS EXISTS. The privacy screen the app shows every athlete says: "To have
 * your account and data deleted, or to get a copy of your data, email us." Until
 * this script, nothing implemented the first half of that sentence — honouring a
 * request meant hand-writing DELETEs across ten tables against a live database,
 * correctly, under time pressure, for a minor. A promise with no mechanism is a
 * promise that gets kept inconsistently, and the inconsistency is invisible.
 *
 * DRY RUN IS THE DEFAULT. Without --yes it reports exactly what it would remove
 * and changes nothing. Deletion is the one operation with no undo, and the
 * failure mode is not "an error" — it is deleting the wrong person, quietly and
 * completely. So the identification step is a separate step with its own output.
 *
 * IT DELETES CHILD ROWS EXPLICITLY, rather than leaning on ON DELETE CASCADE.
 * Every child table declares one, and on Postgres they fire. On SQLite they do
 * NOT: foreign keys are off unless `PRAGMA foreign_keys = ON`, and driver.ts
 * only sets journal_mode. So the cascading version of this script would erase an
 * athlete completely on Supabase and leave every activity, metric and check-in
 * behind on a local file, with the same command, the same exit code and the same
 * "done" — the athlete row gone, so nothing would ever list the orphans again.
 * Explicit deletes behave identically on both targets.
 *
 * WHAT IT DELIBERATELY DOES NOT DELETE:
 *
 *  - The RACE. A race this athlete created is a team fixture that their
 *    teammates' results hang off; deleting it would erase other people's data to
 *    honour this person's request. `races.created_by_athlete_id` is nulled
 *    instead — the column is nullable and already means "coach- or seed-created".
 *    Their own race_results row IS deleted.
 *  - Anything in HealthKit. That data is Apple's, on the athlete's phone, and no
 *    server has ever been able to touch it. Deleting here does not delete there,
 *    and — the direction that matters — a phone that syncs again after this runs
 *    will re-upload the same 30-day backfill under a NEW athlete id if the
 *    athlete is re-added. Unpair the device as part of honouring the request.
 *
 * ALL OR NOTHING. Every statement, plus the verification that the counts really
 * did go to zero, runs in one transaction. A half-deleted athlete is worse than
 * a not-deleted one: it satisfies no request and corrupts every roster query.
 */
import { all, run, transaction, driver, describeTarget, close } from "../src/lib/db/driver";

/**
 * Child tables, in delete order.
 *
 * checkin_soreness before checkins because it also references the checkin row;
 * the rest are independent of each other. Order is what makes this safe on
 * Postgres, where the FKs are enforced.
 */
const CHILD_TABLES = [
  "risk_snapshots",
  "health_metrics",
  "workout_status",
  "chat_messages",
  "goals",
  "injuries",
  "checkin_soreness",
  "checkins",
  "race_results",
  "activities",
] as const;

type Athlete = {
  id: number;
  name: string;
  email: string | null;
  team_id: number | null;
};

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

function usage(msg: string): never {
  console.error(`${msg}

  npx tsx scripts/delete-athlete.ts --email <address> [--yes]
  npx tsx scripts/delete-athlete.ts --id <athlete id> [--yes]

Runs as a dry run unless --yes is given. Must be run from website/.`);
  process.exit(1);
}

async function main() {
  const idArg = arg("--id");
  const emailArg = arg("--email");
  const confirmed = process.argv.includes("--yes");

  if ((idArg === null) === (emailArg === null)) {
    usage("Give exactly one of --id or --email.");
  }

  /*
   * Resolved with an explicit SELECT rather than db.ts's getAthlete/
   * getAthleteByEmail, which both `SELECT *` — and * on this table includes
   * device_token. This script prints what it found so an operator can confirm
   * the right person before typing --yes, and a row that never carries the
   * credential cannot print it by accident, however that output later grows.
   */
  let athlete: Athlete | undefined;
  if (idArg !== null) {
    const id = Number(idArg);
    if (!Number.isInteger(id) || id <= 0) usage(`--id must be a positive integer, got "${idArg}".`);
    athlete = (
      await all<Athlete>("SELECT id, name, email, team_id FROM athletes WHERE id = ?", [id])
    )[0];
  } else {
    athlete = (
      await all<Athlete>(
        "SELECT id, name, email, team_id FROM athletes WHERE lower(email) = lower(?)",
        [emailArg!.trim()]
      )
    )[0];
  }

  console.log(`target:  ${describeTarget()}\n`);

  if (!athlete) {
    // Not an error. A request from someone who was never in the roster, or who
    // was deleted already, is honoured by there being nothing to honour — and
    // the operator needs to be able to say that with confidence.
    console.log(`No athlete matches ${idArg !== null ? `id ${idArg}` : emailArg}.`);
    console.log("Nothing to delete. If they were expected to be here, check the other database.");
    return;
  }

  console.log(`athlete: #${athlete.id}  ${athlete.name}`);
  console.log(`email:   ${athlete.email ?? "(none)"}`);
  console.log(`team:    ${athlete.team_id ?? "(none)"}\n`);

  // What is actually there, per table, before touching anything.
  const counts = new Map<string, number>();
  for (const t of CHILD_TABLES) {
    const row = await all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t} WHERE athlete_id = ?`, [
      athlete.id,
    ]);
    counts.set(t, Number(row[0]?.n ?? 0));
  }
  const racesCreated = Number(
    (
      await all<{ n: number }>(
        "SELECT COUNT(*) AS n FROM races WHERE created_by_athlete_id = ?",
        [athlete.id]
      )
    )[0]?.n ?? 0
  );
  const waitlistRows = athlete.email
    ? Number(
        (
          await all<{ n: number }>("SELECT COUNT(*) AS n FROM waitlist WHERE lower(email) = lower(?)", [
            athlete.email,
          ])
        )[0]?.n ?? 0
      )
    : 0;

  const width = Math.max(...CHILD_TABLES.map((t) => t.length));
  for (const t of CHILD_TABLES) {
    console.log(`  ${t.padEnd(width)}  ${String(counts.get(t)).padStart(6)}  delete`);
  }
  console.log(`  ${"waitlist".padEnd(width)}  ${String(waitlistRows).padStart(6)}  delete`);
  console.log(`  ${"races".padEnd(width)}  ${String(racesCreated).padStart(6)}  keep, unset creator`);
  console.log(`  ${"athletes".padEnd(width)}  ${String(1).padStart(6)}  delete`);

  const total = [...counts.values()].reduce((a, b) => a + b, 0) + waitlistRows + 1;

  if (!confirmed) {
    console.log(`\nDRY RUN — nothing was changed. ${total} rows would be deleted.`);
    console.log("Re-run with --yes to delete them. This cannot be undone.");
    return;
  }

  const deleted = new Map<string, number>();
  await transaction(async (tx) => {
    for (const t of CHILD_TABLES) {
      deleted.set(t, await tx.run(`DELETE FROM ${t} WHERE athlete_id = ?`, [athlete!.id]));
    }
    if (athlete!.email) {
      deleted.set(
        "waitlist",
        await tx.run("DELETE FROM waitlist WHERE lower(email) = lower(?)", [athlete!.email])
      );
    }
    await tx.run("UPDATE races SET created_by_athlete_id = NULL WHERE created_by_athlete_id = ?", [
      athlete!.id,
    ]);
    deleted.set("athletes", await tx.run("DELETE FROM athletes WHERE id = ?", [athlete!.id]));

    /*
     * Verify inside the transaction, so a miss rolls the whole thing back rather
     * than reporting a deletion that did not happen. This is the check that
     * would have caught the cascade bug described at the top of this file.
     */
    for (const t of CHILD_TABLES) {
      const left = Number(
        (
          await tx.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t} WHERE athlete_id = ?`, [
            athlete!.id,
          ])
        )[0]?.n ?? 0
      );
      if (left !== 0) throw new Error(`${t} still holds ${left} rows for athlete ${athlete!.id}`);
    }
    const stillThere = await tx.all("SELECT id FROM athletes WHERE id = ?", [athlete!.id]);
    if (stillThere.length !== 0) throw new Error(`athlete ${athlete!.id} was not deleted`);
  });

  // The receipt. This is what gets quoted back to whoever made the request.
  console.log("\nDeleted:");
  for (const [t, n] of deleted) console.log(`  ${t.padEnd(width)}  ${String(n).padStart(6)}`);
  console.log(
    `\nAthlete #${athlete.id} is gone from ${describeTarget()}, verified in-transaction.`
  );
  console.log(
    "Their phone still holds its device token and their HealthKit data is untouched. " +
      "A re-sync would create nothing (the token no longer resolves), but unpair the " +
      "device to finish the job."
  );
  if (driver() === "sqlite") {
    console.log("This was the LOCAL file. Run again with DB_DRIVER=supabase to clear deployment.");
  }
}

main()
  .catch((e) => {
    console.error(`\nFailed, nothing was deleted: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  })
  .finally(close);
