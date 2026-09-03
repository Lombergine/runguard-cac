/**
 * Which TEAM a request acts for, for coach-scoped routes.
 *
 * The mirror of `apiAuth.ts`, which answers the same question for athletes. Two
 * paths, checked in this order:
 *
 *   - native app: `Authorization: Bearer <coach_token>` → that team
 *   - coach web session: the `mm_session` cookie → that team
 *
 * ── WHY THE TOKEN IS THE COOKIE VALUE, NOT A NEW TABLE ─────────────────────
 * Athlete device tokens are random strings stored in a column, and the obvious
 * move was a matching `coach_tokens` table. It was rejected:
 *
 *  1. A stored token is a SECOND credential for the same account, with its own
 *     lifecycle, its own revocation story and its own way of getting out of
 *     step with the password. The signed value already in circulation has none
 *     of that — it is derived from `SESSION_SECRET` and the team id, so
 *     rotating the secret invalidates every coach session everywhere at once,
 *     cookie and device alike.
 *  2. It cannot be forged without the secret, which is the same property the
 *     web session already depends on. A new table would not be stronger; it
 *     would be a different thing to get wrong.
 *  3. `session.ts` documents a deleted branch that accepted a COMPUTABLE cookie
 *     as a coach session. Reusing `verifyCoachToken` means the bearer path
 *     inherits that hard-won check rather than reimplementing it and
 *     reintroducing the same class of hole from a different direction.
 *
 * The cost is that a coach token cannot be revoked individually — the only
 * lever is rotating `SESSION_SECRET`, which signs everyone out. That is the
 * same lever the web has today, so this adds no new weakness, but it is worth
 * knowing before a lost phone. `signTeam`'s docblock says the rest.
 *
 * ── SCOPE ──────────────────────────────────────────────────────────────────
 * This returns a TEAM, never an athlete. Every caller must scope its own reads
 * by that team id — `getAthlete(id)` then `a.team_id === teamId` — exactly as
 * `resolveAthleteWithPath`'s coach branch does. Returning a team rather than a
 * blanket "is a coach" boolean is deliberate: the deleted branch in session.ts
 * granted team 1 to anyone, and a function whose only answer is yes/no invites
 * exactly that mistake.
 */
import { verifyCoachToken, currentTeamId } from "./session";

/**
 * The team this request may act for, or null.
 *
 * Bearer first so a native client is never affected by a stale cookie that
 * happens to ride along in the same request.
 */
export async function coachTeamId(request: Request): Promise<number | null> {
  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    // `await`: verification now reads the team's `token_version`, so a coach
      // session can actually be revoked rather than being valid until the
      // secret rotates. See lib/session.ts.
      const viaToken = await verifyCoachToken(auth.slice(7));
    // A Bearer header that fails to verify FALLS THROUGH to the cookie rather
    // than rejecting outright: the web app sends no Authorization header at
    // all, so anything here came from a client that meant it, and an athlete
    // device token arriving on a coach route is simply not a coach session.
    // Falling through cannot widen access — the cookie path is independently
    // verified — and it keeps a malformed header from locking out a browser.
    if (viaToken !== null) return viaToken;
  }
  return currentTeamId();
}

/** 401 in the shape the mobile client expects. */
export function unauthorized(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
