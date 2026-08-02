import { getAthlete, getAthleteByToken, AthleteRow } from "./db";
import { athleteTokenFromCookie, currentTeamId } from "./session";

/**
 * Resolve which athlete a request acts for. Three auth paths:
 *  - iOS app: Authorization: Bearer <device_token> → that athlete
 *  - Athlete web portal: athlete session cookie → that athlete (may only act as themselves)
 *  - Coach web session: coach cookie + explicit athleteId in the body/query
 */
export async function resolveAthlete(
  request: Request,
  athleteId?: number | null
): Promise<AthleteRow | null> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token) {
    const a = await getAthleteByToken(token);
    if (a) return a;
  }
  const cookieToken = await athleteTokenFromCookie();
  if (cookieToken) {
    const a = await getAthleteByToken(cookieToken);
    if (a && (athleteId == null || athleteId === a.id)) return a;
  }
  // Coach web session: may act on an athlete ONLY if that athlete is on the
  // coach's own team. This prevents a coach from reading or writing another
  // team's athlete data by passing an arbitrary athleteId.
  if (athleteId != null && Number.isInteger(athleteId)) {
    const teamId = await currentTeamId();
    if (teamId != null) {
      const a = await getAthlete(athleteId);
      if (a && a.team_id === teamId) return a;
    }
  }
  return null;
}
