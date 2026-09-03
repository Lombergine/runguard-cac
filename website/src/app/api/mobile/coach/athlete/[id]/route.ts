import { coachTeamId, unauthorized } from "@/lib/coachAuth";
import { getAthlete, injuriesForAthlete } from "@/lib/db";
import { buildProfile } from "@/lib/profile";
import { readinessState } from "@/lib/readiness";

export const dynamic = "force-dynamic";

/**
 * One athlete, as their coach sees them. The JSON twin of
 * `/dashboard/athlete/[id]`.
 *
 * ── SCOPE, AND WHY IT IS CHECKED BEFORE ANYTHING IS BUILT ──────────────────
 * The team comes from the verified token; the athlete id comes from the URL and
 * is therefore attacker-controlled. So the membership check happens FIRST, on a
 * cheap `getAthlete`, and only then is the expensive profile built. That
 * ordering is the same one `/dashboard/athlete/[id]` uses, and it matters for
 * more than speed: building first and checking later is how a timing difference
 * tells an outsider whether an athlete id exists on some other team.
 *
 * A non-member returns 404, not 403. "This athlete is on another team" is
 * itself information about another team's roster.
 *
 * ── WHAT IS DELIBERATELY NOT IN THE RESPONSE ───────────────────────────────
 *  - `athlete.deviceToken`. `buildProfile` includes it, and it is a full
 *    credential for that athlete's health data. `app/src/lib/api.ts` strips the
 *    same field before any caller sees it; this route is the coach-side mirror
 *    of that rule. A token that never reaches the wire cannot leak from a phone.
 *  - Raw chat. `chatSummary` IS sent, and that is not a softening of the rule:
 *    it is the same already-filtered field the web coach page renders, and the
 *    filtering happens in `buildProfile`'s SQL, not in a caller —
 *    `engine IS NULL OR engine NOT LIKE 'safety:%'`, with the `IS NULL` half
 *    mandatory because SQLite evaluates `NULL NOT LIKE …` to NULL. An athlete
 *    who has just been told to talk to a parent and a doctor does not find that
 *    disclosure quoted on their coach's screen. What is NOT sent is the
 *    transcript: there is no route here that returns chat messages.
 *  - Badges. They are the athlete's own reward surface and mean nothing to a
 *    coach triaging before practice.
 *
 * The sleep, mental and pace series ARE sent. They were held back on the
 * reasoning that they belong to the athlete's app — but the same argument
 * applies to sleep debt and HRV, which a coach plainly does need, and a coach
 * looking at a suppressed HRV wants the thirty nights behind it rather than
 * the one summary figure.
 *
 * The training-year grid IS sent, at ~366 entries. It is the single biggest
 * field here and it was left out on the assumption a coach would not read it;
 * that was wrong — "how hard they went, every single day" is exactly the shape
 * a coach scans for a block that never let up.
 *
 * ── READINESS IS GATED ─────────────────────────────────────────────────────
 * `p.readiness` is never sent raw. `readinessScore()` returns 100 from no data
 * at all, and shipping that number would put the same green "100 · Good to go"
 * on the phone that the web page was showing beside "No data yet". The wire
 * carries `{ known: false }` instead, and the app has no number to render.
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

  const target = await getAthlete(athleteId);
  if (!target || target.team_id !== teamId) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const p = await buildProfile(athleteId);
  if (!p) return Response.json({ ok: false, error: "not found" }, { status: 404 });

  const injuries = await injuriesForAthlete(athleteId);

  return Response.json({
    ok: true,
    athlete: {
      id: p.athlete.id,
      name: p.athlete.name,
      grade: p.athlete.grade,
      hue: p.athlete.hue,
      events: p.athlete.events,
      // NOTE: no deviceToken. See the header.
    },
    connectedSources: p.connectedSources,
    // `{known:false}` or `{known:true,value}` — never a bare number.
    readiness: readinessState(p),
    prePractice: p.prePractice,
    fitness: p.fitness,
    patterns: p.patterns,
    load: p.load,
    risk: {
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
      hasActivityHistory: p.risk.hasActivityHistory,
      selfReport: p.risk.selfReport,
    },
    todayCheckin: p.todayCheckin,
    todaySoreness: p.todaySoreness,
    recentRuns: p.recentRuns,
    energyTrend: p.energyTrend,
    injuries,
    races: { upcoming: p.races.upcoming, history: p.races.history.slice(0, 5) },
    prs: p.prs,
    predictions: p.predictions,
    plan: p.plan,
    /*
     * The FULL DailyPoint, unlike the roster's `{date, load}` sparkline and
     * unlike `/api/mobile/me`, which narrows to `{date, load, km, acwr}`.
     *
     * This is one athlete a coach opened deliberately, not fourteen thumbnails,
     * so the trade runs the other way: the workload-ratio and training-load
     * charts read `acute` alongside `acwr`, and `loadSeries` distinguishes "no
     * row" from "a row whose acute is absent". Narrowing here would make a day
     * the engine never computed look identical to a rest day.
     *
     * Sized to the largest window the coach's picker offers — 6 months, 182
     * days. `buildProfile` produces 183, so the slice is effectively the whole
     * series and the ceiling is upstream rather than here; the number is left
     * explicit so that raising the picker's top range shows up as a decision
     * about the ENGINE's window, not a silently truncated chart.
     */
    series: p.series.slice(-200),
    /**
     * The weekly-distance series. Exactly 12 weeks, and that is an UPSTREAM
     * cap, not a choice here: `buildProfile` builds it with
     * `for (let w = 11; w >= 0; w--)`. Asked for more, there is no more to
     * send — so the app leaves this chart out of the coach's window control
     * rather than letting a "6 months" selection quietly redraw three months.
     */
    weeks: p.weeks,
    /** Safety-filtered in buildProfile. See the header. */
    chatSummary: p.chatSummary,
    /** 30 nights, for the sleep duration chart and the stage breakdown. */
    sleep30: p.sleep30,
    /** 30 days of self-reported energy and motivation. */
    mental30: p.mental30,
    /** Weekly average pace across the season, for the pace trend. */
    paceSeason: p.paceSeason,
    /**
     * PR improvements per event, oldest first — the progression chart. Distinct
     * from `prs`, which is only the current best for each event.
     */
    prProgression: p.races.prProgression,
    /**
     * The training year, one entry per day. Named `calendar` to match the field
     * `/api/mobile/me` already uses for the same thing, so the app's `YearGrid`
     * takes it without a shim.
     */
    calendar: p.yearDays,
    /**
     * Resting HR up AND HRV down together — the pattern that often shows a day
     * or two before someone feels ill. A PATTERN, not a diagnosis, and the
     * pattern row that renders it says so.
     */
    illness: p.illness,
  });
}
