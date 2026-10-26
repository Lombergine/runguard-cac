/**
 * The team audit: the coach's view of whether the score can be trusted.
 *
 * Two questions, both from Impellizzeri et al. (2021), both answered on this
 * team's own data rather than taken on faith:
 *
 *  1. Per athlete: how much of the score is just last week's mileage (the
 *     rescaling self-audit), and where the universal 1.5 cutoff sits in their
 *     own history.
 *  2. Pooled across the team: does the ratio the app shows predict the
 *     injuries the coach logged any better than a ratio whose chronic
 *     denominator is shuffled noise? That is the paper's experiment,
 *     reproduced on the roster. It needs injuries to test against; with
 *     fewer than ten it says so instead of reporting an AUC from a handful
 *     of events.
 *
 * Reads the same tables the roster does. Pure computation after the reads.
 *
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import { activitiesForAthlete, athletesForTeam, injuriesForAthlete } from "./db";
import { acwrSeries, dailySeries } from "./risk";
import { athleteAudit, compareToNull, type NullComparison } from "./acwrDiagnostics";

export const TEAM_AUDIT_DAYS = 366;
/** Below this many logged injuries the pooled test is not run. */
export const MINIMUM_EVENTS = 10;

export type TeamAuditAthlete = {
  id: number;
  name: string;
  hue: number;
  usableDays: number;
  /** Self-audit Spearman, null until 60 usable days. */
  rho: number | null;
  /** Own 95th percentile, null until there is a ratio. */
  p95: number | null;
  /** Share of usable days the universal 1.5 flags. */
  flaggedBy15: number | null;
  /** Own 99th percentile. When it sits below 1.5, the universal cutoff is one this athlete can essentially never reach. */
  p99: number | null;
  injuries: number;
};

export type TeamAudit = {
  days: number;
  athletes: TeamAuditAthlete[];
  pooled: {
    days: number;
    events: number;
    comparison: NullComparison | null;
    /** Why there is no comparison, in words. */
    reason: string | null;
  };
  summary: {
    /** Athletes with enough history for personal cut points. */
    withPersonalZones: number;
    /** Athletes for whom 1.5 sits above their own 99th percentile: a cutoff they can essentially never reach. */
    universalAboveOwn99th: number;
    /** Athletes whose own 95th percentile is below 1.3, the published caution line. */
    own95thBelowCaution: number;
    medianRho: number | null;
  };
};

function median(xs: number[]): number | null {
  const v = [...xs].sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export async function buildTeamAudit(teamId: number, nowMs: number): Promise<TeamAudit> {
  const now = new Date(nowMs);
  const since = new Date(nowMs - TEAM_AUDIT_DAYS * 86400000).toISOString();
  const roster = await athletesForTeam(teamId);

  const pooledAcute: Array<number | null> = [];
  const pooledChronic: Array<number | null> = [];
  const pooledOutcome: Array<number | null> = [];
  let events = 0;

  const athletes: TeamAuditAthlete[] = await Promise.all(
    roster.map(async (a) => {
      const [acts, injuries] = await Promise.all([activitiesForAthlete(a.id, since), injuriesForAthlete(a.id)]);
      const series = acwrSeries(dailySeries(acts, TEAM_AUDIT_DAYS, now));
      const injuryDays = new Set(injuries.map((i) => i.date));
      for (const d of series) {
        const hit = injuryDays.has(d.date) ? 1 : 0;
        pooledAcute.push(d.acwr === null ? null : d.acute);
        pooledChronic.push(d.acwr === null ? null : d.chronic);
        pooledOutcome.push(hit);
        if (hit && d.acwr !== null) events++;
      }
      const audit = athleteAudit(
        series.map((d) => ({ date: d.date, load: d.load, acute: d.acute, chronic: d.chronic, acwr: d.acwr })),
        { draws: 200 },
      );
      const enough = audit.usableDays >= audit.personalZonesMinimumDays;
      return {
        id: a.id,
        name: a.name,
        hue: a.avatar_hue,
        usableDays: audit.usableDays,
        rho: enough && audit.rescaling ? audit.rescaling.spearman : null,
        p95: audit.threshold?.percentiles["95"] ?? null,
        flaggedBy15: audit.threshold?.referenceFlaggedFraction ?? null,
        p99: audit.threshold?.percentiles["99"] ?? null,
        injuries: injuries.length,
      };
    }),
  );

  let comparison: NullComparison | null = null;
  let reason: string | null = null;
  if (events < MINIMUM_EVENTS) {
    reason = `${events} injur${events === 1 ? "y" : "ies"} logged on days that carry a ratio; the test needs about ${MINIMUM_EVENTS} to say anything.`;
  } else {
    try {
      comparison = compareToNull(pooledAcute, pooledChronic, pooledOutcome, { kind: "shuffle", nNullDraws: 120, bootDraws: 500, seed: 0 });
    } catch (e) {
      reason = e instanceof Error ? e.message : "could not run the comparison";
    }
  }

  const rhos = athletes.map((x) => x.rho).filter((v): v is number => v !== null);
  return {
    days: TEAM_AUDIT_DAYS,
    athletes: athletes.sort((x, y) => (y.rho ?? -1) - (x.rho ?? -1)),
    pooled: { days: pooledOutcome.filter((v, i) => v !== null && pooledAcute[i] !== null).length, events, comparison, reason },
    summary: {
      withPersonalZones: athletes.filter((x) => x.rho !== null).length,
      universalAboveOwn99th: athletes.filter((x) => x.p99 !== null && x.p99 < 1.5).length,
      own95thBelowCaution: athletes.filter((x) => x.p95 !== null && x.p95 < 1.3).length,
      medianRho: median(rhos),
    },
  };
}
