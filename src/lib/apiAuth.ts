import { getDb, AthleteRow } from "./db";
import { athleteTokenFromCookie, currentTeamId } from "./session";

function byToken(token: string): AthleteRow | undefined {
  return getDb()
    .prepare("SELECT * FROM athletes WHERE device_token = ?")
    .get(token) as AthleteRow | undefined;
}

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
    const a = byToken(token);
    if (a) return { athlete: a, via: "bearer" };
  }
  const cookieToken = await athleteTokenFromCookie();
  if (cookieToken) {
    const a = byToken(cookieToken);
    if (a && (athleteId == null || athleteId === a.id)) return { athlete: a, via: "athlete" };
  }
  if (athleteId != null && Number.isInteger(athleteId)) {
    // Team-scoped. Without this check, ANY valid coach session reached ANY
    // athlete on ANY team — the previous code only asked whether a coach session
    // existed. currentTeamId() verifies the same cookie isLoggedIn() did, so
    // this is one cookie read rather than two.
    const teamId = await currentTeamId();
    if (teamId == null) return null;
    const a = getDb().prepare("SELECT * FROM athletes WHERE id = ?").get(athleteId) as
      | AthleteRow
      | undefined;
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
