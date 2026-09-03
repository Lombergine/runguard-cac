import { coachTeamId, unauthorized } from "@/lib/coachAuth";
import { athletesForTeam, getTeam, lastSyncForTeam } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Where each athlete's data is coming from, and when it last arrived.
 *
 * ── THIS IS NOT A COPY OF `/dashboard/connect` ─────────────────────────────
 * The web page lists every athlete's `device_token` so a coach can read one out
 * to a runner who is setting up the app. That is defensible on a desktop the
 * coach is sitting at. It is not something to put on a phone.
 *
 * A device token is a full, non-expiring credential for one athlete's health
 * data. Shipping fourteen of them to a device that lives in a pocket, gets
 * handed around, screenshots easily and syncs to a backup means the blast
 * radius of one lost phone stops being "a coach's session" and becomes "every
 * athlete on the team, permanently, with no revocation". `app/src/lib/api.ts`
 * already strips `deviceToken` before any caller sees it, and
 * `/api/mobile/coach/athlete/[id]` does the same. This route is the third
 * instance of one rule, not a new one.
 *
 * So the app answers the question the coach actually has here — "is this
 * athlete's watch data reaching me?" — and leaves pairing to the desktop, where
 * the token already lives.
 *
 * ── WHY `lastSync` CAN BE NULL AND WHAT THAT MEANS ─────────────────────────
 * `lastSyncForTeam` is the newest ACTIVITY per athlete, so null means "no runs
 * recorded", which is not the same as "not connected": a paired athlete who has
 * not run yet is null, and so is one who never installed the app. The wire says
 * only what was measured — the client renders it as an unknown rather than as a
 * failure, because calling it "disconnected" would be a claim this data cannot
 * support.
 */
export async function GET(request: Request) {
  const teamId = await coachTeamId(request);
  if (teamId === null) return unauthorized();

  const team = await getTeam(teamId);
  const athletes = await athletesForTeam(teamId);
  const lastSync = await lastSyncForTeam(teamId);

  return Response.json({
    ok: true,
    team: { id: teamId, name: team?.name ?? null, joinCode: team?.join_code ?? null },
    athletes: athletes.map((a) => ({
      id: a.id,
      name: a.name,
      hue: a.avatar_hue,
      // ISO of their most recent activity, or null. NOTE: no device token.
      lastSync: lastSync.get(a.id) ?? null,
    })),
  });
}
