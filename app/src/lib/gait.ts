/**
 * Gait drift — a second risk channel, independent of training load.
 *
 * Apple Watch (watchOS 9+) writes ground contact time and vertical
 * oscillation to Health for every outdoor run. This compares this week's
 * means against the median of the four weeks BEFORE it and flags mechanical
 * drift when contact time rises more than 5% or oscillation more than 8%
 * without a pace increase that would explain it. The baseline ends before
 * the recent week begins (uncoupled), so a drifting week cannot pull its own
 * baseline toward itself. Thresholds are heuristics, and are labelled as such
 * wherever they appear.
 *
 * Pure functions; the HealthKit reads live in `lib/health.ts`. Tested from
 * `website/src/lib/__tests__/gait.test.ts` against the same cases as the
 * Swift port.
 *
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
 */

export type GaitRun = {
  id: string;
  /** ISO instant the run started. */
  start: string;
  groundContactMs: number | null;
  verticalOscillationCm: number | null;
  speedMps: number | null;
  sampleCount: number;
};

export type GaitDrift = {
  baselineRuns: number;
  recentRuns: number;
  baselineGroundContactMs: number | null;
  recentGroundContactMs: number | null;
  groundContactDrift: number | null;
  baselineVerticalOscillationCm: number | null;
  recentVerticalOscillationCm: number | null;
  verticalOscillationDrift: number | null;
  baselineSpeed: number | null;
  recentSpeed: number | null;
  speedChange: number | null;
  flagsMechanicalDrift: boolean;
  reasons: string[];
};

export type GaitAnalysis =
  | { kind: "noDynamics" }
  | { kind: "insufficientBaseline"; runs: number; needed: number }
  | { kind: "noRecentRuns" }
  | { kind: "analyzed"; drift: GaitDrift };

export const RECENT_WINDOW_DAYS = 7;
export const BASELINE_WINDOW_DAYS = 28;
export const MINIMUM_BASELINE_RUNS = 4;
export const GROUND_CONTACT_DRIFT_THRESHOLD = 0.05;
export const VERTICAL_OSCILLATION_DRIFT_THRESHOLD = 0.08;
export const PACE_TOLERANCE = 0.02;

const DAY_MS = 86400000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function median(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function mean(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function drift(recent: number | null, base: number | null): number | null {
  if (recent == null || base == null || base <= 0) return null;
  return (recent - base) / base;
}

/** A fraction as a percentage with one decimal: 0.064 → "6.4%". */
export const pct = (f: number) => `${(f * 100).toFixed(1)}%`;

export function analyzeGait(runs: GaitRun[], now: Date = new Date()): GaitAnalysis {
  const today = startOfDay(now.getTime());
  const recentStart = today - (RECENT_WINDOW_DAYS - 1) * DAY_MS;
  const baselineEnd = recentStart - DAY_MS;
  const baselineStart = baselineEnd - (BASELINE_WINDOW_DAYS - 1) * DAY_MS;

  const withDynamics = runs.filter((r) => r.groundContactMs != null || r.verticalOscillationCm != null);
  if (!withDynamics.length) return { kind: "noDynamics" };

  const day = (r: GaitRun) => startOfDay(Date.parse(r.start));
  const baseline = withDynamics.filter((r) => day(r) >= baselineStart && day(r) <= baselineEnd);
  if (baseline.length < MINIMUM_BASELINE_RUNS) {
    return { kind: "insufficientBaseline", runs: baseline.length, needed: MINIMUM_BASELINE_RUNS };
  }
  const recent = withDynamics.filter((r) => day(r) >= recentStart && day(r) <= today);
  if (!recent.length) return { kind: "noRecentRuns" };

  const bGCT = median(baseline.map((r) => r.groundContactMs));
  const rGCT = mean(recent.map((r) => r.groundContactMs));
  const bVO = median(baseline.map((r) => r.verticalOscillationCm));
  const rVO = mean(recent.map((r) => r.verticalOscillationCm));
  const bSpeed = median(baseline.map((r) => r.speedMps));
  const rSpeed = mean(recent.map((r) => r.speedMps));
  const gctDrift = drift(rGCT, bGCT);
  const voDrift = drift(rVO, bVO);
  const speedChange = drift(rSpeed, bSpeed);

  const reasons: string[] = [];
  if (gctDrift != null && gctDrift > GROUND_CONTACT_DRIFT_THRESHOLD) {
    reasons.push(`Ground contact time up ${pct(gctDrift)} vs. your 4-week baseline`);
  }
  if (voDrift != null && voDrift > VERTICAL_OSCILLATION_DRIFT_THRESHOLD) {
    reasons.push(`Vertical oscillation up ${pct(voDrift)} vs. your 4-week baseline`);
  }
  let flags = reasons.length > 0;
  const paceExplains = (speedChange ?? 0) > PACE_TOLERANCE;
  if (flags && paceExplains) {
    flags = false;
    reasons.push(`Pace is ${pct(speedChange!)} faster this week, which can explain the change on its own`);
  } else if (flags && speedChange == null) {
    reasons.push("No pace data to rule out a change in effort");
  }

  return {
    kind: "analyzed",
    drift: {
      baselineRuns: baseline.length,
      recentRuns: recent.length,
      baselineGroundContactMs: bGCT,
      recentGroundContactMs: rGCT,
      groundContactDrift: gctDrift,
      baselineVerticalOscillationCm: bVO,
      recentVerticalOscillationCm: rVO,
      verticalOscillationDrift: voDrift,
      baselineSpeed: bSpeed,
      recentSpeed: rSpeed,
      speedChange,
      flagsMechanicalDrift: flags,
      reasons,
    },
  };
}

/**
 * A clearly labelled sample dataset for phones whose watch does not write
 * running dynamics (Garmin and most third-party watches). Deterministic:
 * six weeks, four runs a week, a contact-time rise of about 7% in the final
 * week at unchanged pace. Never presented as real; the panel says "sample".
 */
export function sampleGaitRuns(now: Date = new Date()): GaitRun[] {
  let seed = 2026;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const jitter = (scale: number) => (rnd() * 2 - 1) * scale;
  const today = startOfDay(now.getTime());
  const runs: GaitRun[] = [];
  for (let daysAgo = 41; daysAgo >= 0; daysAgo--) {
    if (![0, 2, 4, 6].includes(daysAgo % 7)) continue;
    const driftWeek = daysAgo < 7;
    runs.push({
      id: `sample-${daysAgo}`,
      start: new Date(today - daysAgo * DAY_MS + 7 * 3600 * 1000).toISOString(),
      groundContactMs: (driftWeek ? 271 : 253) + jitter(3),
      verticalOscillationCm: (driftWeek ? 8.9 : 8.6) + jitter(0.15),
      speedMps: 3.35 + jitter(0.05),
      sampleCount: 420 + Math.round(jitter(40)),
    });
  }
  return runs;
}
