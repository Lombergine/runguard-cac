/**
 * Writes one `risk_snapshots` row per athlete per day — what the engine saw.
 *
 * None of this is displayed. It exists because the engine recomputes from
 * scratch on every request, so a day that isn't written down is gone — and the
 * only thing that could ever justify showing a real number again is a season of
 * these rows labelled by what actually happened to these athletes.
 *
 * Backfill works because computeRisk() takes an explicit `now`, so state can be
 * reconstructed as of any past date from data already in the database. The
 * corpus therefore starts with however much history each athlete already has,
 * not empty.
 *
 * Idempotent per (athlete, day), so re-running repairs a partial run rather
 * than duplicating one. That is what makes the error handling below safe: a
 * failed athlete is skipped, not rolled back, and the next run fixes them.
 *
 * Lives in `src/lib` rather than `scripts/` for two reasons: a serverless route
 * cannot invoke a CLI, and `tsconfig.json` excludes `scripts/` from typechecking
 * — this file is covered by CI, the script that calls it is not.
 */
import {
  listAthletes,
  activitiesForAthlete,
  metricsForAthlete,
  checkinsForAthlete,
  sorenessHistory,
  sorenessForCheckin,
  healthkitIngestSince,
  upsertRiskSnapshot,
  type AthleteRow,
} from "./db";
import { computeRisk, sessionSpike } from "./risk";
import { readinessScore } from "./engine";
import { localDay, localDayOffset } from "./day";

const DAY_MS = 86400000;

/**
 * How recently a phone must have delivered HealthKit data for its athlete to be
 * worth snapshotting. Thirty days is long enough to survive a school holiday or
 * a broken watch charger without dropping someone out of the corpus, and short
 * enough that an athlete who left the team stops accruing rows.
 */
export const INGEST_WINDOW_DAYS = 30;

export type SnapshotResult = {
  /** athletes considered — the whole roster, before gating */
  athletes: number;
  /** rows written or refreshed */
  written: number;
  /** athlete ids skipped because no HealthKit data has arrived recently */
  skipped: number[];
  /** athlete ids whose snapshot threw; the run continued past them */
  failed: number[];
};

/**
 * One snapshot pass.
 *
 * `days` counts back from `now` inclusive: 1 is today only (the nightly job),
 * 365 rebuilds a season. `requireIngest` is the HealthKit gate — off for a
 * local backfill against seeded data, on for anything scheduled.
 */
export async function runSnapshot(
  opts: { days?: number; now?: Date; requireIngest?: boolean } = {}
): Promise<SnapshotResult> {
  const days = Math.max(1, Math.floor(opts.days ?? 1));
  const today = opts.now ?? new Date();
  const requireIngest = opts.requireIngest ?? true;

  const athletes = await listAthletes();
  const result: SnapshotResult = {
    athletes: athletes.length,
    written: 0,
    skipped: [],
    failed: [],
  };
  if (!athletes.length) return result;

  // One grouped query for the whole roster rather than N per-athlete lookups.
  const ingested = requireIngest
    ? await healthkitIngestSince(
        new Date(today.getTime() - INGEST_WINDOW_DAYS * DAY_MS)
          .toISOString()
          .replace("T", " ")
          .slice(0, 19)
      )
    : null;

  const lookback = new Date(today.getTime() - (days + 140) * DAY_MS);

  for (const a of athletes) {
    if (ingested && !ingested.has(a.id)) {
      result.skipped.push(a.id);
      continue;
    }

    // One athlete failing must not cost the rest of the roster its day. Without
    // this, a single dropped pooler connection loses every athlete after it and
    // leaves no record of which ones had already succeeded.
    try {
      result.written += await snapshotAthlete(a, days, today, lookback);
    } catch {
      result.failed.push(a.id);
    }
  }

  return result;
}

/** Replay one athlete's last `days` days. Returns how many rows it wrote. */
async function snapshotAthlete(
  a: AthleteRow,
  days: number,
  today: Date,
  lookback: Date
): Promise<number> {
  // one query per athlete, then filter per day in memory
  const allActs = await activitiesForAthlete(a.id, lookback.toISOString());
  const allMetrics = await metricsForAthlete(a.id, localDay(lookback));
  const allSore = await sorenessHistory(a.id, localDayOffset(days + 10, today));
  const allCheckins = await checkinsForAthlete(a.id, localDay(lookback));

  let written = 0;

  for (let back = days - 1; back >= 0; back--) {
    const asOf = new Date(today.getTime() - back * DAY_MS);
    const date = localDay(asOf);

    // only what was knowable that day — no leakage from the future
    const acts = allActs.filter((x) => localDay(new Date(x.start_time)) <= date);
    const metrics = allMetrics.filter((m) => m.date <= date);
    if (!acts.length && !metrics.length) continue;

    const sore = allSore
      .filter((s) => s.date <= date)
      .map((s) => ({ date: s.date, body_part: s.body_part, severity: s.severity }));
    const risk = computeRisk(acts, metrics, asOf, sore, a);

    const checkin = allCheckins.find((c) => c.date === date) ?? null;
    const todaySore = (await sorenessForCheckin(a.id, date)).map((s) => ({
      part: s.body_part,
      severity: s.severity,
    }));
    const readiness = readinessScore(risk, checkin, todaySore);

    // biggest single-session spike among that day's runs
    let spikePctAbove: number | null = null;
    let spikeKm: number | null = null;
    for (const act of acts.filter((x) => localDay(new Date(x.start_time)) === date)) {
      const sp = sessionSpike(act, acts);
      if (sp && (spikePctAbove === null || sp.pctAbove > spikePctAbove)) {
        spikePctAbove = sp.pctAbove;
        spikeKm = sp.km;
      }
    }

    await upsertRiskSnapshot({
      athlete_id: a.id,
      date,
      acwr: risk.acwr,
      ramp_pct: risk.rampPct,
      monotony: risk.monotony,
      days_since_rest: risk.daysSinceRest,
      week_km: risk.weekKm,
      rhr_delta: risk.recovery.restingHrDelta,
      hrv_delta_pct: risk.recovery.hrvDeltaPct,
      sleep_avg: risk.recovery.sleepAvg,
      soreness_max: risk.selfReport.todayMax,
      soreness_days_7: risk.selfReport.persistentDays,
      energy: checkin?.energy ?? null,
      readiness,
      spike_pct_above: spikePctAbove,
      spike_km: spikeKm,
      hr_max: risk.hrMax.value,
      hr_max_source: risk.hrMax.source,
      legacy_risk_score: risk.score,
    });
    written++;
  }

  return written;
}
