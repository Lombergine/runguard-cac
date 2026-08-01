/**
 * Writes one risk_snapshots row per athlete per day — what the engine saw.
 *
 *   npx tsx scripts/snapshot.ts              # today only (the nightly job)
 *   npx tsx scripts/snapshot.ts --backfill   # rebuild the last 120 days
 *   npx tsx scripts/snapshot.ts --backfill 200
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
 * Idempotent: re-running overwrites that athlete-day rather than duplicating.
 */
import {
  listAthletes,
  activitiesForAthlete,
  metricsForAthlete,
  checkinsForAthlete,
  sorenessHistory,
  sorenessForCheckin,
  upsertRiskSnapshot,
} from "../src/lib/db";
import { computeRisk, sessionSpike } from "../src/lib/risk";
import { readinessScore } from "../src/lib/engine";
import { localDay, localDayOffset } from "../src/lib/day";

const DAY_MS = 86400000;

const args = process.argv.slice(2);
const backfill = args.includes("--backfill");
const days = backfill ? Number(args[args.indexOf("--backfill") + 1]) || 120 : 1;

const athletes = listAthletes();
if (!athletes.length) {
  console.log("No athletes — nothing to snapshot.");
  process.exit(0);
}

let written = 0;
const today = new Date();
const lookback = new Date(today.getTime() - (days + 140) * DAY_MS);

for (const a of athletes) {
  // one query per athlete, then filter per day in memory
  const allActs = activitiesForAthlete(a.id, lookback.toISOString());
  const allMetrics = metricsForAthlete(a.id, localDay(lookback));
  const allSore = sorenessHistory(a.id, localDayOffset(days + 10, today));
  const allCheckins = checkinsForAthlete(a.id, localDay(lookback));

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
    const todaySore = sorenessForCheckin(a.id, date).map((s) => ({
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

    upsertRiskSnapshot({
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
}

console.log(
  `Wrote ${written} snapshot${written === 1 ? "" : "s"} for ${athletes.length} athletes ` +
    `(${backfill ? `backfill, ${days} days` : "today"}).`
);
