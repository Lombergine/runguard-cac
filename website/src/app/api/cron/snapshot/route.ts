import { runSnapshot } from "@/lib/snapshot";
import { driver } from "@/lib/db";

/**
 * The nightly snapshot job. Vercel cron hits this once a day; see vercel.json.
 *
 * WHY THIS IS A ROUTE AND NOT A SCHEDULED SCRIPT. The credentials already live
 * in the deployment. A GitHub Actions runner would need DB_PASSWORD copied into
 * a second place, and DEPLOY.md's whole credential story is that there is one
 * place to look.
 *
 * PRODUCTION ONLY, TWO WAYS. Vercel runs crons on the production deployment
 * only, which is the real gate; the DB_DRIVER check below is the one that does
 * not depend on remembering that. Snapshots are a per-day corpus keyed on
 * (athlete, date) — writing them from a preview deployment aimed at the dev
 * database would quietly interleave two engines' output into one table.
 */
export const maxDuration = 120;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;

  // Fail closed. An unset secret must not mean an open endpoint — this route
  // walks the whole roster and writes to the corpus.
  if (!secret) {
    return Response.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length || auth !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (driver() !== "supabase") {
    return Response.json(
      { error: "Snapshots run against the deployed database only" },
      { status: 503 }
    );
  }

  const started = Date.now();
  const r = await runSnapshot({ days: 1, requireIngest: true });

  // Returned rather than logged as one line, because the old script printed a
  // count and nothing else — you could not tell a quiet night from a broken
  // gate. `skipped` and `failed` are the two numbers that distinguish them.
  return Response.json({
    ...r,
    skipped: r.skipped.length,
    failed: r.failed.length,
    failedIds: r.failed,
    ms: Date.now() - started,
  });
}
