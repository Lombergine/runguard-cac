import { resolveCoachTeam } from "@/lib/apiAuth";
import { athletesForTeam, lastSyncForTeam } from "@/lib/db";

/**
 * Per-athlete sync state, for the coach's Sources tab.
 *
 * The web equivalent is `/dashboard/connect`, and this endpoint answers the one
 * question that page's table answers: is anything actually arriving for this
 * athlete, and when did it last arrive. `lastSyncForTeam` reads the real most
 * recent activity rather than a stored link flag — an athlete can be linked and
 * sending nothing, and a link state would report that as healthy.
 *
 * WHAT IS NOT HERE: the device token. The web page renders one per row behind
 * `TokenButton`, which is a deliberate press by a coach looking at their own
 * screen. A JSON payload is not that — it is cached by the app, held in memory,
 * and written into any proxy log on the way. The iOS design says a token is
 * "copied to the clipboard, never shown on screen", and the safest reading of
 * that is that it is not in the response at all. Pairing a new phone stays a
 * web action.
 *
 * `lastSyncAt` is null — never a placeholder date, never an empty string — when
 * nothing has ever synced, so "waiting for first sync" cannot be mistaken for a
 * very old sync.
 */
export async function GET(request: Request) {
  const teamId = await resolveCoachTeam(request);
  if (teamId == null) {
    return Response.json({ error: "Invalid coach token" }, { status: 401 });
  }

  // Both scoped to the token's team in the query. There is no fallback to the
  // whole athletes table: `/dashboard/connect` had one and it handed every
  // team's rows to any session whose team id was falsy.
  const [roster, lastSync] = await Promise.all([
    athletesForTeam(teamId),
    lastSyncForTeam(teamId),
  ]);

  return Response.json({
    // Allow-listed field by field. `athletesForTeam` returns whole rows
    // carrying `email`, `password_hash` and the vestigial `device_token`.
    athletes: roster.map((a) => ({
      id: a.id,
      name: a.name,
      grade: a.grade,
      hue: a.avatar_hue,
      lastSyncAt: lastSync.get(a.id) ?? null,
      hasSynced: lastSync.has(a.id),
    })),
  });
}
