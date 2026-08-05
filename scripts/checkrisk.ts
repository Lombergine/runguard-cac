import { listAthletes, activitiesForAthlete, metricsForAthlete } from "../src/lib/db";
import { computeRisk } from "../src/lib/risk";
const since = new Date(Date.now() - 130 * 86400000).toISOString();
const rows = await Promise.all((await listAthletes()).map(async (a) => {
  const r = computeRisk(await activitiesForAthlete(a.id, since), await metricsForAthlete(a.id, since));
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
}));
rows.sort((a, b) => b.score - a.score);
console.table(rows);
