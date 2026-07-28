import { getDb, AthleteRow } from "./db";
import { isLoggedIn, athleteTokenFromCookie } from "./session";

function byToken(token: string): AthleteRow | undefined {
  return getDb()
    .prepare("SELECT * FROM athletes WHERE device_token = ?")
    .get(token) as AthleteRow | undefined;
}

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
    const a = byToken(token);
    if (a) return a;
  }
  const cookieToken = await athleteTokenFromCookie();
  if (cookieToken) {
    const a = byToken(cookieToken);
    if (a && (athleteId == null || athleteId === a.id)) return a;
  }
  if (athleteId != null && Number.isInteger(athleteId) && (await isLoggedIn())) {
    const a = getDb().prepare("SELECT * FROM athletes WHERE id = ?").get(athleteId) as
      | AthleteRow
      | undefined;
    if (a) return a;
  }
  return null;
}
