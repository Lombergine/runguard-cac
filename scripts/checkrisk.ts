import { listAthletes, activitiesForAthlete, metricsForAthlete } from "../src/lib/db";
import { computeRisk } from "../src/lib/risk";
const since = new Date(Date.now() - 130 * 86400000).toISOString();
const rows = listAthletes().map((a) => {
  const r = computeRisk(activitiesForAthlete(a.id, since), metricsForAthlete(a.id, since));
  return {
    name: a.name,
    score: r.score,
    zone: r.zone,
    acwr: r.acwr,
    weekKm: r.weekKm,
    ramp: r.rampPct,
    rhrDelta: r.recovery.restingHrDelta,
    hrvPct: r.recovery.hrvDeltaPct,
    sleep: r.recovery.sleepAvg,
  };
});
rows.sort((a, b) => b.score - a.score);
console.table(rows);
