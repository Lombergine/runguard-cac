/**
 * POST /api/mobile/explain — explain this athlete's audit numbers.
 *
 * The numbers come from the server's own profile build, never from the
 * client; the one thing the phone may add is the gait drift it computed from
 * Health samples that never leave the device (two percentages, bounded).
 * Rate-limited like chat, because with a key set this is a paid call.
 *
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import { z } from "zod";
import { buildProfile } from "@/lib/profile";
import { explainAudit, explainInputFrom } from "@/lib/explain";
import { checkRequestRate, tooManyRequests } from "@/lib/rateLimit";
import { verifyAthleteToken } from "@/lib/session";

export const dynamic = "force-dynamic";

const Body = z.object({
  gait: z.object({ gctDriftPct: z.number().min(-100).max(100).nullable(), voDriftPct: z.number().min(-100).max(100).nullable() }).nullable().optional(),
});

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const athleteId = auth.startsWith("Bearer ") ? await verifyAthleteToken(auth.slice(7)) : null;
  if (athleteId === null) return Response.json({ error: "Invalid session token" }, { status: 401 });

  const budget = await checkRequestRate(request, "explain", { max: 10, windowMs: 60_000 });
  if (!budget.allowed) return tooManyRequests(budget.retryAfter);

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  const gait = parsed.success ? (parsed.data.gait ?? null) : null;

  const profile = await buildProfile(athleteId);
  if (!profile) return Response.json({ error: "Not found" }, { status: 404 });
  const last = profile.series.at(-1);
  const input = explainInputFrom(
    profile.audit,
    { acwr: last?.acwr ?? null, acute: last?.acwr == null ? null : last.acute, chronic: last?.acwr == null ? null : last.chronic },
    gait,
  );
  const result = await explainAudit(input);
  return Response.json({ ok: true, ...result });
}
