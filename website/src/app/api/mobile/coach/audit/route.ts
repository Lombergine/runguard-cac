/**
 * The team audit for the native coach tabs: the same `buildTeamAudit` the web
 * dashboard renders, so the phone and the laptop can never disagree.
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import { coachTeamId, unauthorized } from "@/lib/coachAuth";
import { buildTeamAudit } from "@/lib/teamAudit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const teamId = await coachTeamId(request);
  if (teamId === null) return unauthorized();
  const audit = await buildTeamAudit(teamId, Date.now());
  return Response.json({ ok: true, audit });
}
