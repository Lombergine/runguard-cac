import { getAthleteByToken } from "@/lib/db";
import { buildProfile } from "@/lib/profile";

/**
 * The home screen's slice of the profile.
 *
 * `/api/mobile/me` returns the whole athlete — 57 KB for a seeded athlete, of
 * which `calendar` (366 days), `risk.series` (400 days) and `series` (60 days)
 * are ~75% on their own. The home screen renders none of that: it needs the
 * greeting, today's readiness and pre-practice state, today's check-in, the
 * recent runs list, this week's plan, and the four risk fields the header reads.
 * This endpoint returns exactly those, ~2 KB.
 *
 * It deliberately still goes through buildProfile rather than recomputing a
 * cheaper subset. readiness and prePractice are safety-adjacent, and a second
 * derivation of them is a second thing to keep in step — the home screen must
 * never show a different readiness than the rest of the app. So this is a
 * payload optimisation, not a compute one; the server work is unchanged.
 *
 * Additive: /api/mobile/me keeps its current shape.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const athlete = token ? await getAthleteByToken(token) : undefined;
  if (!athlete) {
    return Response.json({ error: "Invalid device token" }, { status: 401 });
  }
  const profile = await buildProfile(athlete.id);
  if (!profile) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({
    athlete: profile.athlete,
    readiness: profile.readiness,
    prePractice: profile.prePractice,
    todayCheckin: profile.todayCheckin,
    todaySoreness: profile.todaySoreness,
    recentRuns: profile.recentRuns,
    // The header's four inputs. `risk.series` in particular is 18 KB and is
    // what makes the full `risk` object too heavy to send here.
    risk: {
      hasActivityHistory: profile.risk.hasActivityHistory,
      weekKm: profile.risk.weekKm,
      recovery: { hasData: profile.risk.recovery.hasData },
      selfReport: profile.risk.selfReport,
    },
    // weeklyPlan already emits exactly Monday–Sunday of the current week, so
    // this is the current week with no further filtering.
    plan: { days: profile.plan.days },
  });
}
