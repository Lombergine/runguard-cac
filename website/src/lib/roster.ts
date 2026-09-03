/**
 * The coach's roster, computed once for every surface that shows it.
 *
 * `/dashboard` (a Server Component) and `/api/mobile/coach/roster` (the native
 * app) are the same screen rendered twice, and this is the thing they share so
 * they cannot disagree. That mattered immediately: the roster's "no check-in"
 * column was reading soreness recency and calling it check-in recency, and on
 * the seeded team it labelled five athletes as silent who had all reported
 * within a day. Fixing that in the page alone would have left the app shipping
 * the original bug from the same database.
 *
 * WHAT IS AND IS NOT HERE. Everything derived from athlete data lives here.
 * Presentation does not: the tiles' wording, the dashed chip, the sort's
 * position in the list. The web renders that in TSX and the app renders it in
 * React Native, and neither can be shared. What CAN be shared is every number
 * and every verdict, and all of those are below.
 *
 * The sort IS here, deliberately, even though it looks like presentation. It is
 * the spec's "sort by missing data, not by risk" rule, and a client that
 * re-sorted by its own idea of urgency would quietly reintroduce the risk
 * ranking that rule exists to forbid.
 */
import { localDayOffset } from "./day";
import {
  athletesForTeam,
  activitiesForAthlete,
  metricsForAthlete,
  sorenessHistory,
  checkinsForAthlete,
} from "./db";
import {
  computeRisk,
  sessionSpike,
  type RiskSnapshot,
  type SessionSpike,
  type DailyPoint,
} from "./risk";
import { computeFitness, type Fitness } from "./engine";
import { hasSelfReport } from "./readiness";
import { fetchDays, type Range } from "./range";

/**
 * How many days without a self-report before the roster calls it stale.
 *
 * One constant because three things depend on agreeing: a row's own "no
 * check-in · Nd" flag, the sort that lifts those rows to the top, and the
 * "not checking in" tile that counts them.
 */
export const STALE_AFTER_DAYS = 5;

/**
 * How far back to look for a check-in, in days INCLUDING today.
 *
 * Shared with the soreness lookback so both columns describe the same
 * fortnight. It is also the bound a client states when nothing is found: the
 * query cannot see past it, so "no check-in in 14d" is the strongest honest
 * claim available. "never" would assert something that was not measured.
 */
export const SELF_REPORT_LOOKBACK_DAYS = 14;

/**
 * Whole days between two local `YYYY-MM-DD` days.
 *
 * Midday anchors on both sides, the same trick lib/risk.ts uses: parsing bare
 * dates as UTC midnight and subtracting puts a DST boundary within rounding
 * distance of a whole day, which is how an 11-day gap becomes 10 or 12.
 */
export function daysBetween(from: string, to: string): number {
  const ms = new Date(to + "T12:00:00").getTime() - new Date(from + "T12:00:00").getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

export type RosterEntry = {
  athlete: {
    id: number;
    name: string;
    grade: number | null;
    hue: number;
  };
  /** `computeRisk` returns the snapshot PLUS the daily series the sparkline
   *  draws, so the type has to carry both or the chart loses its data. */
  risk: RiskSnapshot & { series: DailyPoint[] };
  fitness: Fitness;
  spike: SessionSpike | null;
  /** Distance over the coach's chosen window, and the equal window before it. */
  rangeKm: number;
  prevRangeKm: number;
  /**
   * Days since the last check-in that carried an actual self-report, or null
   * when there was none inside SELF_REPORT_LOOKBACK_DAYS. Null is "not in the
   * window we looked at", NOT "never".
   */
  daysSinceCheckIn: number | null;
};

export type RosterSummary = {
  /** Athletes whose most recent long run was well past their usual. */
  spikes: number;
  /** Athletes reporting the same sore spot on 3+ of the last 7 days. */
  sore: number;
  /** Athletes with no self-report inside STALE_AFTER_DAYS. */
  quiet: number;
  teamKm: number;
  /** Null, not 0: with no distance in the previous window there is no
   *  percentage to state, and "+0%" would claim the team held steady. */
  teamChangePct: number | null;
};

export type Roster = {
  entries: RosterEntry[];
  summary: RosterSummary;
  stale: number;
  lookbackDays: number;
};

/**
 * Build the roster for one team.
 *
 * `nowMs` is passed in rather than read here so the caller owns the clock —
 * the dashboard is a `force-dynamic` Server Component where `Date.now()` is
 * the request time, and a route handler is the same. Taking it as an argument
 * also makes this testable without freezing time globally.
 */
export async function buildRoster(
  teamId: number,
  range: Range,
  nowMs: number
): Promise<Roster> {
  const now = new Date(nowMs);
  // Read wide enough for the chosen window AND the equal window before it, plus
  // the 28-day chronic baseline the risk engine builds off the same array. See
  // fetchDays(): a short window must not starve ACWR.
  const since = new Date(nowMs - fetchDays(range) * 86400000).toISOString();
  const rangeStart = new Date(nowMs - range.days * 86400000).toISOString();
  const prevRangeStart = new Date(nowMs - range.days * 2 * 86400000).toISOString();
  const soreSince = localDayOffset(SELF_REPORT_LOOKBACK_DAYS - 1, now);
  const todayIso = localDayOffset(0, now);

  const roster = await athletesForTeam(teamId);

  const entries: RosterEntry[] = await Promise.all(
    roster.map(async (a) => {
      const acts = await activitiesForAthlete(a.id, since);
      const metrics = await metricsForAthlete(a.id, since);
      // The roster is the coach's triage screen — it has to see what athletes
      // reported, not just what their watches recorded.
      const sore = (await sorenessHistory(a.id, soreSince)).map((s) => ({
        date: s.date,
        body_part: s.body_part,
        severity: s.severity,
      }));
      const risk = computeRisk(acts, metrics, now, sore, a);

      /*
       * CHECK-IN RECENCY, FROM CHECK-INS.
       *
       * Not `risk.selfReport.daysSinceReport`, which does not mean what the
       * column says. `computeSelfReport` takes `reports: SorenessReport[]`, so
       * that field is days since the athlete last reported something HURTING
       * and `hasData` is "has ever reported a sore spot".
       *
       * The two come apart for exactly the athletes who are fine. Measured on
       * the seeded team: all 14 had checked in within a day, and the roster
       * still labelled five "no check-in", up to "· 11d" — because a runner
       * who answers every morning and has nothing sore creates check-in rows
       * and no soreness rows. The screen whose whole job is "who have I not
       * heard from" was pointing at the healthy.
       *
       * `hasSelfReport` is the same predicate the readiness gate uses, so a row
       * that unlocks a readiness number on the detail screen is the same row
       * that counts as a check-in here.
       */
      const checkins = await checkinsForAthlete(a.id, soreSince);
      const lastReport = checkins
        .filter(hasSelfReport)
        .reduce<string | null>((m, c) => (m === null || c.date > m ? c.date : m), null);
      const daysSinceCheckIn =
        lastReport === null ? null : daysBetween(lastReport, todayIso);

      const fitness = computeFitness(risk, metrics, acts);

      // Distance over the window the coach picked, and over the equally long
      // window immediately before it. Computed here rather than taken from
      // risk.weekKm, which is fixed at 7 days by definition and must stay that
      // way — ACWR is only meaningful on its own windows.
      const km = (from: string, to?: string) =>
        acts
          .filter((x) => x.start_time >= from && (to === undefined || x.start_time < to))
          .reduce((sum, x) => sum + x.distance_m / 1000, 0);

      // Most recent run that was markedly longer than anything before it.
      const spikeRun = [...acts]
        .sort((x, y) => y.start_time.localeCompare(x.start_time))
        .slice(0, 7)
        .map((x) => ({ at: x.start_time, spike: sessionSpike(x, acts) }))
        .find((x) => x.spike !== null);

      return {
        athlete: { id: a.id, name: a.name, grade: a.grade, hue: a.avatar_hue },
        risk,
        fitness,
        spike: spikeRun?.spike ?? null,
        rangeKm: km(rangeStart),
        prevRangeKm: km(prevRangeStart, rangeStart),
        daysSinceCheckIn,
      };
    })
  );

  /*
   * MISSING DATA FIRST, THEN ALPHABETICAL. Never by risk.
   *
   * The no-risk-ranking rule stands, and it is the reason this is not a score
   * sort: ranking minors by an injury number teaches them to inflate their
   * check-ins to stay off the top of it, which corrupts self-report — the most
   * sensitive signal in the whole system.
   *
   * Sorting by what is MISSING is a different act, and the one
   * ../../../docs/visual-spec.md § "Coach dashboard" asks for: "Sort by missing
   * data, not by risk." They pull in opposite directions on purpose. A risk sort
   * is answered by reporting LESS; a missing-data sort can only be answered by
   * reporting AT ALL, which is the behaviour the product wants.
   */
  const missingness = (x: RosterEntry): number => {
    if (x.daysSinceCheckIn === null) return 0;
    return x.daysSinceCheckIn >= STALE_AFTER_DAYS ? 1 : 2;
  };
  entries.sort(
    (x, y) => missingness(x) - missingness(y) || x.athlete.name.localeCompare(y.athlete.name)
  );

  const teamKm = entries.reduce((s, x) => s + x.rangeKm, 0);
  const teamPrevKm = entries.reduce((s, x) => s + x.prevRangeKm, 0);

  return {
    entries,
    stale: STALE_AFTER_DAYS,
    lookbackDays: SELF_REPORT_LOOKBACK_DAYS,
    summary: {
      spikes: entries.filter((x) => x.spike !== null).length,
      sore: entries.filter(
        (x) => x.risk.selfReport.persistentPart && x.risk.selfReport.persistentDays >= 3
      ).length,
      quiet: entries.filter(
        (x) => x.daysSinceCheckIn === null || x.daysSinceCheckIn >= STALE_AFTER_DAYS
      ).length,
      teamKm,
      teamChangePct:
        teamPrevKm > 0 ? Math.round(((teamKm - teamPrevKm) / teamPrevKm) * 100) : null,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Team-level aggregates
 *
 * The coach's overview tab — on the web at `/dashboard`, in the app at
 * `coach/(tabs)/dashboard` — answers "how is the squad" rather than "who do I
 * open". Every figure below is an aggregate of what `buildRoster` already
 * computed per athlete: this adds no scoring of its own, deliberately, because
 * a team number that disagreed with the sum of the rows behind it would be
 * unfalsifiable from the roster tab.
 *
 * It lives here, beside `buildRoster`, for the reason the header gives about
 * the roster itself — the web page and the native app must not compute this
 * twice and drift.
 * ------------------------------------------------------------------ */

export type TeamStats = {
  /** Acute:chronic spread. `rated` is the denominator, and it is not the squad. */
  acwr: { under: number; inZone: number; over: number; rated: number; unrated: number };
  /** Athletes whose last self-report is today. */
  reportedToday: number;
  /** Tier mix, strongest first, zero-count tiers omitted. */
  tiers: { tier: string; n: number }[];
  /** Team distance per complete week, oldest first, at most 12. */
  weeks: { week: string; km: number }[];
  /** Athletes with a spike, a soreness pattern, or a stale/absent check-in. */
  needsLook: number;
};

/** The Monday of the week a YYYY-MM-DD falls in, as YYYY-MM-DD. */
function mondayOf(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  // getDay() is 0 on Sunday, which belongs to the week that began 6 days back.
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return d.toISOString().slice(0, 10);
}

export function teamStats(entries: RosterEntry[], todayIso: string): TeamStats {
  /*
   * Bands are taken over athletes with real training history, never over the
   * whole squad. An athlete who has never synced has no workload ratio, and
   * folding them into the denominator would silently report them as sitting in
   * the safe band. `unrated` carries the count that is missing so the surface
   * can state it rather than drop it.
   */
  const withHistory = entries.filter((e) => e.risk.hasActivityHistory);
  const rated = withHistory.filter((e) => e.risk.acwr !== null);
  const acwrOf = (e: RosterEntry) => e.risk.acwr as number;

  const byWeek = new Map<string, number>();
  for (const e of entries) {
    for (const d of e.risk.series) {
      const monday = mondayOf(d.date);
      byWeek.set(monday, (byWeek.get(monday) ?? 0) + d.km);
    }
  }
  /*
   * The week in progress is DROPPED, not drawn short. On a Tuesday it holds
   * two days against twelve full weeks beside it, so it renders about a
   * seventh the height of the rest — a squad that looks like it has stopped
   * training. An incomplete measurement must not be drawn in the same shape as
   * a complete one; the surface says the bars end last week.
   */
  const currentWeek = mondayOf(todayIso);
  const weeks = [...byWeek.entries()]
    .filter(([week]) => week !== currentWeek)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([week, km]) => ({ week, km: Math.round(km * 10) / 10 }));

  const TIER_ORDER = ["Elite", "Advanced", "Intermediate", "Developing"];
  const tiers = TIER_ORDER.map((tier) => ({
    tier,
    n: entries.filter((e) => e.fitness.tier === tier).length,
  })).filter((t) => t.n > 0);

  return {
    acwr: {
      under: rated.filter((e) => acwrOf(e) < 0.8).length,
      inZone: rated.filter((e) => acwrOf(e) >= 0.8 && acwrOf(e) <= 1.3).length,
      over: rated.filter((e) => acwrOf(e) > 1.3).length,
      rated: rated.length,
      unrated: entries.length - rated.length,
    },
    reportedToday: entries.filter((e) => e.daysSinceCheckIn === 0).length,
    tiers,
    weeks,
    needsLook: entries.filter(
      (e) =>
        e.spike !== null ||
        (e.risk.selfReport.persistentPart && e.risk.selfReport.persistentDays >= 3) ||
        e.daysSinceCheckIn === null ||
        e.daysSinceCheckIn >= STALE_AFTER_DAYS
    ).length,
  };
}
