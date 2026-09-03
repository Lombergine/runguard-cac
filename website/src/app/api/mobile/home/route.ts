import { buildProfile } from "@/lib/profile";
import { verifyAthleteToken } from "@/lib/session";

/**
 * The home screen's slice of the profile.
 *
 * `/api/mobile/me` returns the whole athlete — 57 KB for a seeded athlete, of
 * which `calendar` (366 days), `risk.series` (400 days) and `series` (60 days)
 * are ~75% on their own. The home screen renders none of that: it needs the
 * greeting, today's readiness and pre-practice state, today's check-in, the
 * recent runs list, this week's plan and its mileage target, the recovery
 * snapshot, the insight line, the next race, and the notifications.
 * This endpoint returns exactly those — 5.3 KB at the seeded worst case.
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
  const athleteId = auth.startsWith("Bearer ") ? await verifyAthleteToken(auth.slice(7)) : null;
  if (athleteId === null) {
    return Response.json({ error: "Invalid session token" }, { status: 401 });
  }
  const profile = await buildProfile(athleteId);
  if (!profile) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({
    // No `deviceToken` to strip any more — see the note in ../me/route.ts.
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
      // The whole RecoverySnapshot: nine scalars, ~150 bytes. The home screen
      // shows resting HR, HRV and sleep against their baselines, and each of
      // those needs its baseline to say anything.
      recovery: profile.risk.recovery,
      selfReport: profile.risk.selfReport,
    },
    // weeklyPlan already emits exactly Monday–Sunday of the current week, so
    // this is the current week with no further filtering.
    plan: { days: profile.plan.days },
    // The denominator for the weekly mileage tile — meaningless without it.
    weeklyTargetKm: profile.weeklyTargetKm,
    aiInsight: profile.aiInsight,
    // Only the next race. `upcoming` is unbounded and each entry carries a
    // pacing array, so the whole list is not a fixed cost; one is.
    races: { upcoming: profile.races.upcoming.slice(0, 1) },
    notifications: profile.notifications,
  });
}
