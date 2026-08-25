import { resolveAthleteWithPath } from "@/lib/apiAuth";
import { rotateDeviceToken } from "@/lib/db";
import { checkAuthRate, recordAuthFailure } from "@/lib/rateLimit";
import { athleteLogIn } from "@/lib/session";

/**
 * Rotate this athlete's device token — the "unpair everywhere" button.
 *
 * ROTATION IS REVOCATION, by construction. Authentication is a plain equality
 * lookup on `athletes.device_token` (`getAthleteByToken`), and this overwrites
 * that single column, so the instant it returns every previously issued copy of
 * the old token resolves to no row: the old phone, the athlete web cookie, a
 * token pasted into a support thread, the fourteen an agent spilled into a log.
 * There is no per-device record to miss and no grace period during which both
 * values authenticate. The cost is the flip side of the same fact — this cannot
 * revoke one device and spare another, it is all of them or none.
 *
 * WHO MAY CALL IT: the athlete themself, over `Authorization: Bearer` or their
 * own session cookie. Explicitly NOT the coach path. A coach seizing a device
 * token would hand an adult silent, ongoing access to a minor's health data
 * under the athlete's own identity, which is worse than the leak this fixes, so
 * `via === "coach"` is rejected even though passing no athleteId already makes
 * that branch unreachable inside `resolveAthleteWithPath` — the guard is what
 * keeps it unreachable if that resolver ever changes.
 *
 * No athlete id is read from the request. The token or cookie names the subject;
 * there is no parameter to point at someone else.
 */
export async function POST(request: Request) {
  const resolved = await resolveAthleteWithPath(request);
  if (!resolved || resolved.via === "coach") {
    return Response.json({ error: "Please log in first." }, { status: 401 });
  }

  // Bounded per (IP, athlete) by the shared limiter. Whoever holds a token can
  // already rotate once and strand the real device, so this is not what stops a
  // thief — it stops a loop, from one host, churning a minor's credential and
  // the writes behind it. Each rotation is recorded, not just the rejected ones:
  // here the successful call IS the costly event, which is the opposite of the
  // login path the limiter was written for.
  const id = `rotate-token:${resolved.athlete.id}`;
  const limit = await checkAuthRate(request, id);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many rotations. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const token = await rotateDeviceToken(resolved.athlete.id);
  await recordAuthFailure(request, id);

  // The cookie we just authenticated with holds the token this call killed.
  // Re-issue it so rotating from the web portal does not sign the athlete out
  // of the tab they clicked it in. Bearer callers get no Set-Cookie; the app
  // stores the returned token itself.
  if (resolved.via === "athlete") await athleteLogIn(token);

  return Response.json({ ok: true, token });
}
