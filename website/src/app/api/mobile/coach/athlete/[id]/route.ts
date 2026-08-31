import { resolveCoachTeam } from "@/lib/apiAuth";
import { getAthlete } from "@/lib/db";
import { buildProfile } from "@/lib/profile";

/** What the condensed coach view shows before pointing at the full log — same as the web page. */
const RACE_HISTORY_LIMIT = 5;

/**
 * One athlete's detail, for the coach's athlete screen.
 *
 * SCOPE. 404, not 403, for an athlete on another team — and the same 404 for an
 * id that does not exist. `/dashboard/athlete/[id]` does exactly this with
 * `notFound()`, and the reason is that a 403 would confirm the id is a real
 * athlete on a real team. A coach could then walk the integers and learn the
 * size and membership boundaries of every other roster in the database.
 *
 * NO CHAT. `CoreProfile.chatSummary` is the athlete's last five questions and
 * the web coach page renders them verbatim. It is excluded here, entirely,
 * rather than filtered: `lib/safety.ts` tags crisis, purging and dosing
 * exchanges so they stay off a coach's screen, and the only way to be sure a
 * coach payload cannot leak one is for it to carry no chat at all. Do not add
 * it back on the grounds that the query already filters — that filter is one
 * `engine IS NULL` clause away from being wrong, and this endpoint would not
 * notice.
 *
 * NO CREDENTIAL FIELD. `buildProfile` no longer carries one at all — athletes
 * authenticate with a signed session minted at login, and nothing in the profile
 * can be used to act as them. See `lib/session.ts`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const teamId = await resolveCoachTeam(request);
  if (teamId == null) {
    return Response.json({ error: "Invalid coach token" }, { status: 401 });
  }

  const { id } = await params;
  const athleteId = Number(id);
  if (!Number.isInteger(athleteId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Strict `!==`, matching the web page's note: `&& target.team_id` would
  // short-circuit to a pass for a team-less athlete.
  const target = await getAthlete(athleteId);
  if (!target || target.team_id !== teamId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const p = await buildProfile(athleteId);
  if (!p) return Response.json({ error: "Not found" }, { status: 404 });

  // An explicit allow-list, for the reason spelled out in ../../../me/route.ts:
  // with a spread, every field `CoreProfile` grows ships to the phone the moment
  // it exists, decided by nobody. Adding a line here is the moment to ask
  // whether a COACH should see it.
  return Response.json({
    athlete: p.athlete,
    readiness: p.readiness,
    // Coach wording. `athleteReason` is the athlete's own copy of the same
    // observation and is not a coach's to read out.
    prePractice: { flag: p.prePractice.flag, reason: p.prePractice.reason },
    illness: p.illness,
    aiInsight: p.aiInsight,
    insights: p.insights,
    // Without `series` — 400 days, and the trimmed copy below is what the
    // charts read.
    risk: {
      zone: p.risk.zone,
      zoneLabel: p.risk.zoneLabel,
      hasActivityHistory: p.risk.hasActivityHistory,
      selfReport: p.risk.selfReport,
      hrMax: p.risk.hrMax,
      acwr: p.risk.acwr,
      acute: p.risk.acute,
      chronic: p.risk.chronic,
      weekKm: p.risk.weekKm,
      prevWeekKm: p.risk.prevWeekKm,
      rampPct: p.risk.rampPct,
      monotony: p.risk.monotony,
      strain: p.risk.strain,
      daysSinceRest: p.risk.daysSinceRest,
      lastActivity: p.risk.lastActivity,
      recovery: p.risk.recovery,
      insights: p.risk.insights,
    },
    load: p.load,
    fitness: p.fitness,
    patterns: p.patterns,
    todayCheckin: p.todayCheckin,
    todaySoreness: p.todaySoreness,
    energyTrend: p.energyTrend,
    recentRuns: p.recentRuns,
    injuries: p.injuries,
    goals: p.goals,
    weeklyTargetKm: p.weeklyTargetKm,
    connectedSources: p.connectedSources,
    plan: { days: p.plan.days, taperMode: p.plan.taperMode, taperCountdown: p.plan.taperCountdown },
    weeks: p.weeks,
    sleep30: p.sleep30,
    mental30: p.mental30,
    races: {
      upcoming: p.races.upcoming,
      history: p.races.history.slice(0, RACE_HISTORY_LIMIT),
    },
    // Same 60-day trim as /api/mobile/me, and the same caveat: these four fields
    // drop `acute` and `chronic`, so a chart wired to this copy draws no EWMA.
    series: p.series.slice(-60).map(({ date, load, km, acwr }) => ({ date, load, km, acwr })),
  });
}
