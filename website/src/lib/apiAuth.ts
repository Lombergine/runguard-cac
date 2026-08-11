import { getAthlete, getAthleteByToken, AthleteRow } from "./db";
import { athleteTokenFromCookie, currentTeamId } from "./session";

/** Which of the three auth paths matched. */
export type AuthPath = "bearer" | "athlete" | "coach";

/**
 * Resolve which athlete a request acts for, and say HOW it resolved. Three paths:
 *  - iOS app: Authorization: Bearer <device_token> → that athlete
 *  - Athlete web portal: athlete session cookie → that athlete (themselves only)
 *  - Coach web session: coach cookie + explicit athleteId, scoped to their team
 *
 * Callers need the path, not just the row: a coach reading an athlete's chat is
 * a different thing from the athlete reading their own, and only one of them
 * should see safety-intercepted messages.
 */
export async function resolveAthleteWithPath(
  request: Request,
  athleteId?: number | null
): Promise<{ athlete: AthleteRow; via: AuthPath } | null> {
  // The single scope gate every path goes through. The Bearer path used to skip
  // it and return the token's own athlete no matter which id the caller asked
  // for, so `resolveAthlete(request, victimId)` answered truthily for any device
  // token — an IDOR wherever the route then trusted the client's id (it did, in
  // strava/connect and strava/sync). Applying it by construction here means a
  // fourth auth path cannot reintroduce the hole by forgetting the comparison.
  const scoped = (a: AthleteRow | null | undefined, via: AuthPath) =>
    a && (athleteId == null || athleteId === a.id) ? { athlete: a, via } : null;

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token) {
    const r = scoped(await getAthleteByToken(token), "bearer");
    if (r) return r;
  }
  const cookieToken = await athleteTokenFromCookie();
  if (cookieToken) {
    const r = scoped(await getAthleteByToken(cookieToken), "athlete");
    if (r) return r;
  }
  if (athleteId != null && Number.isInteger(athleteId)) {
    // Team-scoped. Without this check, ANY valid coach session reached ANY
    // athlete on ANY team — the previous code only asked whether a coach session
    // existed. currentTeamId() verifies the same cookie isLoggedIn() did, so
    // this is one cookie read rather than two.
    const teamId = await currentTeamId();
    if (teamId == null) return null;
    const a = await getAthlete(athleteId);
    if (a && a.team_id === teamId) return scoped(a, "coach");
  }
  return null;
}

export async function resolveAthlete(
  request: Request,
  athleteId?: number | null
): Promise<AthleteRow | null> {
  const r = await resolveAthleteWithPath(request, athleteId);
  return r ? r.athlete : null;
}
