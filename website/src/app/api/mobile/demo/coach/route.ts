import { getTeam } from "@/lib/db";
import { demoTeamId } from "@/lib/demo";
import { signTeam } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * One tap into the app as the demo COACH.
 *
 * The sibling `../route.ts` is the same idea for the athlete, and the reason
 * both exist rather than reusing `/api/demo/coach` is the same: the web demo
 * works by putting the credential in an httpOnly cookie and letting middleware
 * refuse every non-GET for cookie sessions. The app sends
 * `Authorization: Bearer <coach token>` and has no cookie, so none of that
 * machinery applies to it.
 *
 * Until the phone had coach screens this route would have had nothing to open,
 * and `welcome.tsx` handed the visitor to a browser instead. It has them now —
 * roster, athlete detail, calendar, sources — so the demo shows the app.
 *
 * WHAT THIS HANDS OUT. `signTeam(demoTeamId())`: a real coach credential for a
 * real team, minted without the coach password because the demo team is the one
 * team anyone may open. It dies with `SESSION_SECRET`.
 *
 * THE STANDING CONDITION, from `lib/demo.ts`: the demo team must contain only
 * seeded data. A coach token is strictly more than an athlete one — it reads
 * every athlete on the team — so the moment a real runner joins that team,
 * every visitor is reading a real minor's health record. Nothing in code can
 * check that.
 *
 * IT IS READ-ONLY, and not by politeness. `resolveCoachTeam` refuses to resolve
 * the demo team for any non-GET, so the calendar writer and anything added
 * beside it reject a hand-written request as well as one from this app.
 */
export async function GET() {
  const teamId = demoTeamId();
  // Off unless configured, and indistinguishable from a route that was never
  // built — the same posture as every other demo route.
  if (teamId === null) return new Response("Not found", { status: 404 });

  const team = await getTeam(teamId);
  if (!team) {
    return new Response(
      "DEMO_TEAM_ID names a team that does not exist. Re-seed with `npm run seed`.",
      { status: 503 }
    );
  }

  return Response.json({ token: signTeam(teamId), name: team.name });
}
