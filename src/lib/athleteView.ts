import { localDay } from "./day";
import { ActivityRow } from "./db";
import { RiskSnapshot, DailyPoint } from "./risk";
import { KM_PER_MI, miNum } from "./units";

export type PacePoint = {
  week: string; // label
  pace: number | null; // seconds per km, distance-weighted
};

export type PersonalStats = {
  biggestWeekKm: number;
  longestRunKm: number;
  fastestPace: string | null; // "4:12/km"
  runsLast30: number;
};

export type Workout = {
  day: string;
  title: string;
  detail: string;
};

export function fmtPace(secPerKm: number): string {
  const secPerMi = secPerKm * KM_PER_MI;
  const m = Math.floor(secPerMi / 60);
  const s = Math.round(secPerMi % 60);
  return `${m}:${String(s).padStart(2, "0")}/mi`;
}

/** Distance-weighted average pace per week over the last 12 weeks. */
export function paceTrend(series: DailyPoint[], activities: ActivityRow[]): PacePoint[] {
  const out: PacePoint[] = [];
  const byDay = new Map<string, { dist: number; time: number }>();
  for (const a of activities) {
    if (a.distance_m < 2000 || a.duration_s <= 0) continue;
    const d = localDay(new Date(a.start_time));
    const cur = byDay.get(d) || { dist: 0, time: 0 };
    cur.dist += a.distance_m;
    cur.time += a.duration_s;
    byDay.set(d, cur);
  }
  for (let w = 11; w >= 0; w--) {
    const chunk = series.slice(series.length - (w + 1) * 7, series.length - w * 7);
    let dist = 0;
    let time = 0;
    for (const day of chunk) {
      const v = byDay.get(day.date);
      if (v) {
        dist += v.dist;
        time += v.time;
      }
    }
    const start = chunk[0]?.date;
    out.push({
      week: start
        ? new Date(start + "T12:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : "",
      pace: dist > 3000 ? time / (dist / 1000) : null,
    });
  }
  return out;
}

export function personalStats(series: DailyPoint[], activities: ActivityRow[]): PersonalStats {
  let biggest = 0;
  for (let w = 0; w < 17; w++) {
    const chunk = series.slice(
      Math.max(0, series.length - (w + 1) * 7),
      series.length - w * 7
    );
    const km = chunk.reduce((s, d) => s + d.km, 0);
    if (km > biggest) biggest = km;
  }
  let longest = 0;
  let fastest: number | null = null;
  const cutoff30 = Date.now() - 30 * 86400000;
  let runs30 = 0;
  for (const a of activities) {
    const km = a.distance_m / 1000;
    if (km > longest) longest = km;
    if (km >= 3 && a.duration_s > 0) {
      const p = a.duration_s / km;
      if (fastest === null || p < fastest) fastest = p;
    }
    if (new Date(a.start_time).getTime() > cutoff30) runs30++;
  }
  return {
    biggestWeekKm: Math.round(biggest),
    longestRunKm: Math.round(longest * 10) / 10,
    fastestPace: fastest ? fmtPace(fastest) : null,
    runsLast30: runs30,
  };
}

/** Insights rewritten in second person — what the athlete reads in their app. */
export function athleteInsights(risk: RiskSnapshot): string[] {
  const out: string[] = [];
  const { acwr, rampPct, monotony, daysSinceRest, weekKm, prevWeekKm } = risk;

  if (acwr !== null) {
    if (acwr > 1.5) {
      out.push(
        `Your training load is way above what your body is used to (ratio ${acwr.toFixed(2)}). This is the zone where most running injuries happen — the smartest thing you can do this week is back off before your body forces you to.`
      );
    } else if (acwr > 1.3) {
      out.push(
        `You're pushing above your safe zone (ratio ${acwr.toFixed(2)}). You don't need to stop — just don't stack more hard days on top of this.`
      );
    } else if (acwr < 0.6 && weekKm > 2) {
      out.push(
        `You're rebuilding after time off. Your engine is ready before your bones and tendons are — keep the jumps small even when it feels easy.`
      );
    } else {
      out.push(
        `Your load ratio is ${acwr?.toFixed(2)} — right in the sweet spot. You're building fitness about as fast as your body can absorb it.`
      );
    }
  }

  if (rampPct !== null && rampPct > 30) {
    out.push(
      `Your mileage jumped ${Math.round(rampPct)}% this week (${miNum(prevWeekKm)} → ${miNum(weekKm)} mi). Anything past ~10% per week starts stacking risk — hold here for a week before adding more.`
    );
  }

  if (monotony !== null && monotony > 2) {
    out.push(
      `Almost every run this week was the same effort. Easy days need to feel almost too easy — that's when your body actually absorbs the training.`
    );
  }

  if (daysSinceRest >= 10) {
    out.push(
      `You haven't taken a rest day in ${daysSinceRest} days. Rest isn't lost fitness — it's where the fitness gets built.`
    );
  }

  const r = risk.recovery;
  if (r.restingHrDelta !== null && r.restingHrDelta >= 5) {
    out.push(
      `Your resting heart rate is up ${r.restingHrDelta} bpm from your normal (${r.restingHrBaseline} → ${r.restingHr}). That usually means you're not fully recovered — or something's coming on. Prioritize sleep and easy days.`
    );
  }
  if (r.hrvDeltaPct !== null && r.hrvDeltaPct <= -12) {
    out.push(
      `Your HRV is down ${Math.abs(r.hrvDeltaPct)}% from baseline — your body is still carrying stress from recent training. A true easy day will bring it back faster than pushing through.`
    );
  }
  if (r.sleepAvg !== null && r.sleepAvg < 7) {
    out.push(
      `You're averaging ${r.sleepAvg}h of sleep. Getting to 8+ is the single biggest thing you can do to stay healthy and actually absorb your training.`
    );
  }

  if (out.length === 0) {
    out.push("Everything looks healthy. Keep the rhythm going — consistency is the whole game.");
  }
  return out;
}

/**
 * DEAD CODE — exported but never called; nothing imports it.
 *
 * Left in place rather than deleted because it is not mine to remove, but note
 * it prescribes training from the internal risk zone and tells athletes to
 * "re-check your score", which no longer exists. If it is ever wired up it
 * needs rewriting against the spike warning and check-in signals first.
 */
export function recommendedWorkouts(risk: RiskSnapshot): Workout[] {
  const dayName = (offset: number) =>
    new Date(Date.now() + offset * 86400000).toLocaleDateString("en-US", {
      weekday: "long",
    });

  if (risk.zone === "high") {
    return [
      {
        day: dayName(1),
        title: "Rest or 20 min recovery jog",
        detail: "Fully conversational pace. If anything aches, take the full day off.",
      },
      {
        day: dayName(2),
        title: "30–40 min easy",
        detail: "Heart rate low, nose-breathing pace. No strides, no surges.",
      },
      {
        day: dayName(3),
        title: "40 min easy + mobility",
        detail: "Cut this week's volume ~30% below last week. Re-check your score before adding intensity.",
      },
    ];
  }
  if (risk.zone === "caution") {
    return [
      {
        day: dayName(1),
        title: "Genuine easy day — 35 min",
        detail: "Slower than feels natural. This is the variety your week is missing.",
      },
      {
        day: dayName(2),
        title: "Moderate run 45 min + 4 strides",
        detail: "Relaxed strides on flat ground, full recovery between.",
      },
      {
        day: dayName(3),
        title: "Rest day",
        detail: "A planned day off now beats an unplanned month off later.",
      },
    ];
  }
  return [
    {
      day: dayName(1),
      title: "Easy run 40–50 min",
      detail: "Conversational pace, relaxed form.",
    },
    {
      day: dayName(2),
      title: "Workout: 4–5 × 4 min tempo",
      detail: "Comfortably hard — around the effort you could race for an hour. 2 min jog between.",
    },
    {
      day: dayName(3),
      title: "Easy 35 min + 6 strides",
      detail: "Keep it light the day after a workout. Strides sharpen turnover without adding load.",
    },
  ];
}
