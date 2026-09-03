import { coachTeamId, unauthorized } from "@/lib/coachAuth";
import { getAthlete } from "@/lib/db";
import { chatHistory } from "@/lib/chat";

export const dynamic = "force-dynamic";

/**
 * The athlete's chat transcript, as their coach may see it.
 *
 * ── WHY THIS IS ITS OWN ROUTE AND NOT `/api/chat` ──────────────────────────
 * `/api/chat`'s GET already does the right thing:
 *
 *     includeSafety: r.via !== "coach"
 *
 * but it gets `via` from `resolveAthleteWithPath`, which knows three auth
 * paths — athlete device token, athlete cookie, coach cookie — and a coach
 * BEARER token is none of them. A native coach client simply 401s there.
 *
 * The fix is not to teach `resolveAthleteWithPath` a fourth path. That
 * function's whole guarantee is that it resolves an ATHLETE and scopes them,
 * and threading a credential through it that resolves a TEAM would put the
 * coach case one boolean away from the athlete case on every route that calls
 * it — including the ones that write.
 *
 * ── THE EXCLUSION IS HARDCODED, NOT DERIVED ────────────────────────────────
 * `includeSafety: false` is a literal below. It is not computed from the auth
 * path, not read from a query parameter, and not passed in by the caller,
 * because this route exists ONLY for coaches: there is no correct request to
 * it that should return a safety-intercepted message. An athlete who has just
 * been told to talk to a parent and a doctor does not find that disclosure on
 * their coach's phone, and no argument to this endpoint can change that.
 *
 * `/api/chat`'s own comment makes the same point from the other side:
 * "Filtering chatSummary alone would have left the full transcript one tab
 * away, which is not a privacy fix."
 *
 * ── READ ONLY ──────────────────────────────────────────────────────────────
 * There is no POST here, and that is deliberate rather than unfinished.
 * `/api/chat` refuses a coach write because a coach typing into an athlete's
 * transcript would be indistinguishable from the athlete having said it —
 * including to `safetyIntercept`, which would then log it under the athlete's
 * name. A route that cannot write cannot get that wrong.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const teamId = await coachTeamId(request);
  if (teamId === null) return unauthorized();

  const { id } = await params;
  const athleteId = Number(id);
  if (!Number.isInteger(athleteId)) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }

  // Team scope first, on a cheap read, and 404 rather than 403 — "this athlete
  // is on another team" is itself information about another team's roster.
  const target = await getAthlete(athleteId);
  if (!target || target.team_id !== teamId) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const history = await chatHistory(athleteId, 30, { includeSafety: false });

  return Response.json({
    ok: true,
    // Every row here is `safety: false` by construction — the query excluded
    // the others. The field is kept so the shape matches `/api/chat`, and so a
    // client that ever sees `true` has found a bug rather than a message.
    history,
  });
}
