import { coachTeamId, unauthorized } from "@/lib/coachAuth";
import { getTeam, teamPlanDays } from "@/lib/db";
import { localDayOffset } from "@/lib/day";
import { parseRange } from "@/lib/range";
import { buildRoster, teamStats } from "@/lib/roster";

export const dynamic = "force-dynamic";

/**
 * The coach's roster, for the native app. The JSON twin of `/dashboard`.
 *
 * Both call `buildRoster`, so every number and verdict here is the same one the
 * web page renders — see lib/roster.ts for why that sharing is not optional.
 * What this route adds is the wire format, and the only real decision in it is
 * what to leave out.
 *
 * ── WHY THE SERIES IS TRIMMED ──────────────────────────────────────────────
 * `computeRisk` returns a full daily series per athlete — with the 130-day
 * minimum read in `fetchDays`, that is ~130 points × 14 athletes × five numeric
 * fields before this route does anything. The roster draws ONE thing from it: a
 * 28-bar sparkline of daily load (`LoadSpark` slices `-28` and reads `load`).
 *
 * So it ships 28 points of `{date, load}` and nothing else. That is the same
 * move `/api/mobile/me` makes when it narrows its series, and for the same
 * reason: a phone on school wifi before practice should not download four
 * months of per-day training load to draw fourteen thumbnails. Anything a
 * coach taps into comes from the athlete route, which has the full picture.
 *
 * ── WHAT A COACH MAY SEE ───────────────────────────────────────────────────
 * `athletesForTeam(teamId)` inside `buildRoster` is the whole scope, and the
 * team id comes from the verified token, never from the request body. There is
 * no athleteId parameter to tamper with. Chat is absent entirely: safety-tagged
 * exchanges must never reach a coach surface in any form, not even a count.
 */
export async function GET(request: Request) {
  const teamId = await coachTeamId(request);
  if (teamId === null) return unauthorized();

  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get("range") ?? undefined);
  const nowMs = Date.now();

  const team = await getTeam(teamId);
  const { entries, summary, stale, lookbackDays } = await buildRoster(teamId, range, nowMs);

  // Today and tomorrow off the team calendar — the "what are we doing" glance
  // the dashboard shows above the roster. Two days, not seven; the full
  // calendar is its own screen.
  const todayIso = localDayOffset(0, new Date(nowMs));
  const tomorrowIso = localDayOffset(-1, new Date(nowMs));
  const planAhead = await teamPlanDays(teamId, todayIso, tomorrowIso);

  return Response.json({
    ok: true,
    team: { id: teamId, name: team?.name ?? null, joinCode: team?.join_code ?? null },
    range: { key: range.key, days: range.days, short: range.short },
    // Pre-formatted, local to the SERVER, because every date this product
    // renders is a pre-formatted local string and a client must never derive
    // one. Same rule the app's own components follow.
    today: todayIso,
    tomorrow: tomorrowIso,
    plan: {
      today: planAhead.get(todayIso) ?? null,
      tomorrow: planAhead.get(tomorrowIso) ?? null,
    },
    summary,
    /*
      The overview tab's aggregates, computed here rather than on the phone.
      `teamStats` needs the FULL per-athlete series and each athlete's workload
      ratio; the `spark` below is deliberately trimmed to 28 points of load and
      carries neither. Shipping the raw material instead would mean sending
      four months of daily distance for fourteen athletes so a phone could add
      it up — and would let the app's arithmetic drift from the web page's.
    */
    teamStats: teamStats(entries, todayIso),
    // The thresholds travel with the payload so the app states the same bounds
    // the server measured, rather than hardcoding 5 and 14 and drifting.
    staleAfterDays: stale,
    lookbackDays,
    athletes: entries.map((e) => ({
      id: e.athlete.id,
      name: e.athlete.name,
      grade: e.athlete.grade,
      hue: e.athlete.hue,
      tier: e.fitness.tier,
      rangeKm: e.rangeKm,
      daysSinceCheckIn: e.daysSinceCheckIn,
      spike: e.spike,
      // Only the two soreness facts the row can render. The rest of
      // `selfReport` is engine internals the roster never shows.
      soreness: {
        persistentPart: e.risk.selfReport.persistentPart,
        persistentDays: e.risk.selfReport.persistentDays,
        persistentPeak: e.risk.selfReport.persistentPeak,
        escalating: e.risk.selfReport.escalating,
        todayPart: e.risk.selfReport.todayPart,
        todayMax: e.risk.selfReport.todayMax,
      },
      spark: e.risk.series.slice(-28).map((p) => ({ date: p.date, load: p.load })),
    })),
  });
}
