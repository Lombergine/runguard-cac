/**
 * POST /api/explain — the web twin of /api/mobile/explain. An athlete session
 * explains its own numbers; a coach session may name an athlete on their
 * team with ?athlete=<id>. Numbers come from the server's profile build.
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import { buildProfile } from "@/lib/profile";
import { explainAudit, explainInputFrom } from "@/lib/explain";
import { checkRequestRate, tooManyRequests } from "@/lib/rateLimit";
import { athleteTokenFromCookie, currentTeamId, verifyAthleteToken } from "@/lib/session";
import { getAthlete } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET, not POST: nothing is written, and the demo session blocks writes. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const asked = url.searchParams.get("athlete");
  let athleteId: number | null = null;

  const teamId = await currentTeamId();
  if (teamId !== null && asked) {
    const a = await getAthlete(Number(asked));
    if (a && a.team_id === teamId) athleteId = a.id;
  }
  if (athleteId === null) {
    athleteId = await verifyAthleteToken((await athleteTokenFromCookie()) ?? undefined);
  }
  if (athleteId === null) return Response.json({ error: "Not signed in" }, { status: 401 });

  const budget = await checkRequestRate(request, "explain", { max: 10, windowMs: 60_000 });
  if (!budget.allowed) return tooManyRequests(budget.retryAfter);

  const profile = await buildProfile(athleteId);
  if (!profile) return Response.json({ error: "Not found" }, { status: 404 });
  const last = profile.series.at(-1);
  const input = explainInputFrom(profile.audit, {
    acwr: last?.acwr ?? null,
    acute: last?.acwr == null ? null : last.acute,
    chronic: last?.acwr == null ? null : last.chronic,
  });
  const result = await explainAudit(input);
  return Response.json({ ok: true, ...result });
}
