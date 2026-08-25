/**
 * Strava's webhook has no HMAC. Unlike Stripe or GitHub, Strava signs nothing —
 * the POST body is the only thing that arrives, so there is no cryptographic
 * proof a given event came from Strava. What it does carry is `subscription_id`,
 * the id returned when the push subscription was created, which is not published
 * anywhere. That is the strongest lever available, so this endpoint gates on it,
 * and on the owner actually being an athlete we hold a token for.
 *
 * Be clear about what that buys: a shared secret in the body is a filter, not
 * authentication. The subscription id is a short number, so treat it as raising
 * the cost of a forged event rather than making one impossible. The remaining
 * blast radius is deliberately small — a forged-but-accepted event can only make
 * us re-fetch one activity id belonging to one already-linked athlete, using
 * that athlete's own token, and `insertActivity` dedupes by external id.
 *
 * Both secrets FAIL CLOSED. An unset env var refuses the request; it never falls
 * back to a default, because a default that ships in the repo is public, and a
 * public verify token lets anyone claim this callback URL as their own
 * subscription endpoint.
 */
import crypto from "crypto";
import { one } from "@/lib/db/driver";
import { importOneActivity } from "@/lib/strava";

/** Constant-time compare, hashed first so unequal lengths do not leak. */
function sameSecret(given: string, expected: string): boolean {
  return crypto.timingSafeEqual(
    crypto.createHash("sha256").update(given).digest(),
    crypto.createHash("sha256").update(expected).digest()
  );
}

/** Strava webhook subscription validation. */
export async function GET(request: Request) {
  const expected = process.env.STRAVA_VERIFY_TOKEN?.trim();
  if (!expected) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && challenge && sameSecret(token, expected)) {
    return Response.json({ "hub.challenge": challenge });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Strava pushes new-activity events here — this is the real-time sync. */
export async function POST(request: Request) {
  const expectedSubscription = process.env.STRAVA_SUBSCRIPTION_ID?.trim();
  if (!expectedSubscription) return new Response("Forbidden", { status: 403 });

  const event = await request.json().catch(() => null);
  if (!event || typeof event !== "object") {
    return new Response("Bad Request", { status: 400 });
  }
  if (!sameSecret(String(event.subscription_id ?? ""), expectedSubscription)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Deauthorisations and athlete-object events are real but not ours to act on;
  // 200 so Strava stops retrying them.
  if (
    event.object_type !== "activity" ||
    (event.aspect_type !== "create" && event.aspect_type !== "update")
  ) {
    return Response.json({ ok: true, ignored: true });
  }

  // Both ids are pasted into a Strava API path and a SQL parameter downstream.
  // Digits only, so neither can steer the request somewhere else.
  const ownerId = String(event.owner_id ?? "");
  const objectId = String(event.object_id ?? "");
  if (!/^\d+$/.test(ownerId) || !/^\d+$/.test(objectId)) {
    return new Response("Bad Request", { status: 400 });
  }

  const athlete = await one<{ id: number }>(
    "SELECT id FROM athletes WHERE strava_athlete_id = ?",
    [ownerId]
  );
  if (!athlete) return new Response("Unknown athlete", { status: 404 });

  // Respond fast; do the import without blocking Strava's 2s timeout. Past this
  // point the status code cannot report failure, so the failure gets logged
  // rather than dropped — Strava retries a non-200 only three times, and paying
  // for a token refresh plus an activity fetch inside that budget would trade a
  // silent miss for a duplicated one.
  importOneActivity(ownerId, objectId).catch((err) => {
    console.error(`strava webhook: import failed for activity ${objectId}`, err);
  });
  return Response.json({ ok: true });
}
