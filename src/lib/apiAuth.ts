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
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token) {
    const a = await getAthleteByToken(token);
    // Honour an explicit athleteId here for the same reason the cookie branch
    // below does. A device token authenticates exactly ONE athlete, so a token
    // holder naming somebody else is either a bug or an attack — and a route
    // that forwards the caller's id downstream instead of the resolved row
    // (as /api/strava/connect did) would otherwise act on that stranger.
    //
    // Safe to tighten: no in-repo client sends both. The iOS app posts to
    // /api/mobile/*, which reads the token directly and never takes an
    // athleteId. Mismatches fall through rather than hard-denying, so a request
    // carrying both a stale Bearer header and a valid coach cookie still
    // resolves by the coach path.
    if (a && (athleteId == null || athleteId === a.id)) return { athlete: a, via: "bearer" };
  }
  const cookieToken = await athleteTokenFromCookie();
  if (cookieToken) {
    const a = await getAthleteByToken(cookieToken);
    if (a && (athleteId == null || athleteId === a.id)) return { athlete: a, via: "athlete" };
  }
  if (athleteId != null && Number.isInteger(athleteId)) {
    // Team-scoped. Without this check, ANY valid coach session reached ANY
    // athlete on ANY team — the previous code only asked whether a coach session
    // existed. currentTeamId() verifies the same cookie isLoggedIn() did, so
    // this is one cookie read rather than two.
    const teamId = await currentTeamId();
    if (teamId == null) return null;
    const a = await getAthlete(athleteId);
    if (a && a.team_id === teamId) return { athlete: a, via: "coach" };
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
