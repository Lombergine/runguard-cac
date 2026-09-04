/**
 * Android Health Connect, behind the same shapes `lib/health.ts` already uses.
 *
 * ⚠ UNVERIFIED ON DEVICE. Every other module in this app was checked against a
 * running build; this one was not. The machine it was written on has no Android
 * SDK, no JDK and no emulator, and `app/android/` has never been generated, so
 * not one line here has been compiled or executed. Treat the record-to-payload
 * mappings below as informed by the type definitions in
 * `react-native-health-connect@4.1.3` and by nothing else. Expect to fix things
 * the first time it runs on real hardware, and do not put it in front of an
 * athlete until someone has.
 *
 * ── HOW THIS DIFFERS FROM HEALTHKIT, WHICH IS WHY IT IS A SEPARATE FILE ────
 *
 *  1. Health Connect is an APP, not an OS service. It ships with Android 14 and
 *     is a Play Store install below that, so "unavailable" here means "the user
 *     has no Health Connect", which is fixable by them — unlike an iPhone with
 *     no Health store. `availability()` returns that as its own reason.
 *
 *  2. Denial IS disclosed. `getGrantedPermissions()` returns exactly what was
 *     allowed, where Apple deliberately tells you nothing. So on Android the app
 *     can say "you granted sleep but not workouts" — the opposite of the
 *     read-and-see-what-arrives dance `health.ts` documents for iOS.
 *
 *  3. There is no "workout" record with distance and heart rate attached. An
 *     `ExerciseSession` carries only a type and a span; distance and heart rate
 *     are SEPARATE record streams that have to be read over the same window and
 *     matched back by time. `readWorkouts` below does that join, and it is the
 *     part most likely to be wrong in practice.
 *
 *  4. Records carry `metadata.id`, which is stable per record and is what goes
 *     out as `external_id`, so re-syncing a window is free — same contract as
 *     HealthKit's sample uuid.
 */
import { Platform } from "react-native";

import type { IngestMetric, IngestPayload, IngestWorkout } from "./health";

/* ------------------------------------------------------------------ *
 * Module loading
 * ------------------------------------------------------------------ */

type HealthConnectApi = typeof import("react-native-health-connect");

/** `undefined` = not tried, `null` = tried and absent. Same idiom as health.ts. */
let cachedApi: HealthConnectApi | null | undefined;

/**
 * Lazy and guarded, for the same reason the HealthKit require is: a top-level
 * import of a native module that is not in the build throws while the bundle is
 * still evaluating, which takes down the whole app rather than one screen.
 */
function api(): HealthConnectApi | null {
  if (cachedApi !== undefined) return cachedApi;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedApi = require("react-native-health-connect") as HealthConnectApi;
  } catch {
    cachedApi = null;
  }
  return cachedApi;
}

export type HcAvailability =
  | { ok: true }
  /** iOS or web — HealthKit is the path there. */
  | { ok: false; reason: "notAndroid" }
  /** The native module is not in this build. */
  | { ok: false; reason: "noModule" }
  /** No Health Connect on this phone. Installable from the Play Store. */
  | { ok: false; reason: "notInstalled" }
  /** Health Connect is present but too old to talk to. */
  | { ok: false; reason: "needsUpdate" };

/**
 * Whether Health Connect can be used, asked of the provider itself.
 *
 * Async where the iOS twin is sync: `getSdkStatus` is a real IPC call into
 * another app, and there is no cached synchronous answer to give.
 */
export async function availability(): Promise<HcAvailability> {
  if (Platform.OS !== "android") return { ok: false, reason: "notAndroid" };
  const hc = api();
  if (!hc) return { ok: false, reason: "noModule" };
  try {
    const status = await hc.getSdkStatus();
    if (status === hc.SdkAvailabilityStatus.SDK_AVAILABLE) return { ok: true };
    if (status === hc.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      return { ok: false, reason: "needsUpdate" };
    }
    return { ok: false, reason: "notInstalled" };
  } catch {
    return { ok: false, reason: "noModule" };
  }
}

/* ------------------------------------------------------------------ *
 * Permissions
 * ------------------------------------------------------------------ */

/**
 * Read-only, and every type is one the engine actually consumes.
 *
 * `Distance` and `HeartRate` are here because an `ExerciseSession` does not
 * carry them — see the header. Nothing is requested for writing: the app writes
 * nothing back, and asking for a permission it never uses would be a prompt the
 * athlete cannot refuse selectively.
 */
const READ_TYPES = [
  "ExerciseSession",
  "Distance",
  "HeartRate",
  "RestingHeartRate",
  "HeartRateVariabilityRmssd",
  "SleepSession",
  "Vo2Max",
  "RespiratoryRate",
] as const;

/**
 * Shows the Health Connect permission screen, and reports what was granted.
 *
 * Unlike iOS this answer is TRUE — Health Connect discloses denial — so callers
 * can say which categories are missing rather than syncing to find out.
 */
export async function requestPermissions(): Promise<{ granted: string[] }> {
  const hc = api();
  if (!hc) return { granted: [] };
  await hc.initialize();
  const granted = await hc.requestPermission(
    READ_TYPES.map((recordType) => ({ accessType: "read" as const, recordType }))
  );
  return {
    granted: granted
      .map((p) => ("recordType" in p ? String(p.recordType) : ""))
      .filter(Boolean),
  };
}

/** What the athlete has already allowed, without showing a prompt. */
export async function grantedTypes(): Promise<string[]> {
  const hc = api();
  if (!hc) return [];
  try {
    await hc.initialize();
    const granted = await hc.getGrantedPermissions();
    return granted
      .map((p) => ("recordType" in p ? String(p.recordType) : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Health Connect's own settings screen — where a denial is undone. */
export function openSettings(): void {
  api()?.openHealthConnectSettings();
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

type Read = { operator: "between"; startTime: string; endTime: string };

function window(since: Date): Read {
  return {
    operator: "between",
    startTime: since.toISOString(),
    endTime: new Date().toISOString(),
  };
}

/**
 * A local `YYYY-MM-DD` for an instant.
 *
 * Deliberately not `toISOString().slice(0,10)`: that files an evening reading
 * under tomorrow in every timezone behind UTC, which is the bug `lib/dates`
 * exists to prevent and which the ingest route rejects on shape alone.
 */
function localDayOf(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Exercise sessions, with distance and heart rate joined back on by time.
 *
 * The join is the fragile part: Health Connect writers are not required to
 * align a Distance record to a session's exact bounds, so this sums every
 * distance record that OVERLAPS the session. A writer that emits one long
 * daily distance record would therefore over-count, and that is the first
 * thing to check when a figure looks wrong on real hardware.
 */
async function readWorkouts(hc: HealthConnectApi, at: Read): Promise<IngestWorkout[]> {
  const sessions = await hc.readRecords("ExerciseSession", { timeRangeFilter: at });
  if (sessions.records.length === 0) return [];

  const [distances, heartRates] = await Promise.all([
    hc.readRecords("Distance", { timeRangeFilter: at }),
    hc.readRecords("HeartRate", { timeRangeFilter: at }),
  ]);

  return sessions.records.map((s) => {
    const start = new Date(s.startTime).getTime();
    const end = new Date(s.endTime).getTime();

    const distanceM = distances.records
      .filter((d) => overlaps(start, end, new Date(d.startTime).getTime(), new Date(d.endTime).getTime()))
      .reduce((sum, d) => sum + (d.distance?.inMeters ?? 0), 0);

    const beats = heartRates.records
      .filter((h) => overlaps(start, end, new Date(h.startTime).getTime(), new Date(h.endTime).getTime()))
      .flatMap((h) => h.samples ?? [])
      .filter((sample) => {
        const t = new Date(sample.time).getTime();
        return t >= start && t <= end;
      })
      .map((sample) => sample.beatsPerMinute)
      .filter((bpm) => Number.isFinite(bpm) && bpm > 0);

    const workout: IngestWorkout = {
      id: s.metadata?.id ?? `${s.startTime}-${s.exerciseType}`,
      name: s.title ?? "Run",
      type: String(s.exerciseType),
      start: s.startTime,
      durationS: Math.max(0, Math.round((end - start) / 1000)),
      distanceM: Math.round(distanceM),
    };
    if (beats.length > 0) {
      workout.avgHr = Math.round(beats.reduce((a, b) => a + b, 0) / beats.length);
      workout.maxHr = Math.max(...beats);
    }
    return workout;
  });
}

/** Hours actually asleep — awake and out-of-bed stages excluded, as on iOS. */
function asleepHours(hc: HealthConnectApi, stages: { startTime: string; endTime: string; stage: number }[]) {
  const S = hc.SleepStageType;
  const counted = new Set<number>([S.SLEEPING, S.LIGHT, S.DEEP, S.REM]);
  const ms = (from: string, to: string) => new Date(to).getTime() - new Date(from).getTime();
  const total = (want: number[]) =>
    stages
      .filter((st) => want.includes(st.stage))
      .reduce((sum, st) => sum + ms(st.startTime, st.endTime), 0) / 3_600_000;
  return {
    asleep: total([...counted]),
    deep: total([S.DEEP]),
    rem: total([S.REM]),
    light: total([S.LIGHT]),
  };
}

/**
 * One row per local day, merged across record types.
 *
 * Every field is independently optional: a watch worn without sleep tracking
 * reports `restingHr` and nothing else, and the server stores null — never 0 —
 * for what it did not receive.
 */
async function readMetrics(hc: HealthConnectApi, at: Read): Promise<IngestMetric[]> {
  const [resting, hrv, sleep, vo2, resp] = await Promise.all([
    hc.readRecords("RestingHeartRate", { timeRangeFilter: at }),
    hc.readRecords("HeartRateVariabilityRmssd", { timeRangeFilter: at }),
    hc.readRecords("SleepSession", { timeRangeFilter: at }),
    hc.readRecords("Vo2Max", { timeRangeFilter: at }),
    hc.readRecords("RespiratoryRate", { timeRangeFilter: at }),
  ]);

  const byDay = new Map<string, IngestMetric>();
  const row = (date: string): IngestMetric => {
    const existing = byDay.get(date);
    if (existing) return existing;
    const created: IngestMetric = { date };
    byDay.set(date, created);
    return created;
  };

  for (const r of resting.records) row(localDayOf(r.time)).restingHr = Math.round(r.beatsPerMinute);
  for (const r of hrv.records) row(localDayOf(r.time)).hrv = Math.round(r.heartRateVariabilityMillis);
  for (const r of vo2.records) row(localDayOf(r.time)).vo2max = r.vo2MillilitersPerMinuteKilogram;
  for (const r of resp.records) row(localDayOf(r.time)).respRate = r.rate;

  for (const s of sleep.records) {
    // A night is dated the morning it ENDS — the same rule the app's own sleep
    // ring uses, so the two never disagree about which night is "last night".
    const target = row(localDayOf(s.endTime));
    const stages = s.stages ?? [];
    if (stages.length > 0) {
      const { asleep, deep, rem, light } = asleepHours(hc, stages);
      target.sleepHours = asleep;
      if (deep > 0) target.sleepDeep = deep;
      if (rem > 0) target.sleepRem = rem;
      if (light > 0) target.sleepLight = light;
    } else {
      // No staging: the session span is the best available answer, and it is
      // in-bed time rather than asleep time. Recorded, not invented.
      const hours =
        (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 3_600_000;
      if (hours > 0) target.sleepHours = hours;
    }
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Everything since `since`, in the shape `/api/mobile/ingest` accepts. */
export async function readSince(since: Date): Promise<IngestPayload> {
  const hc = api();
  if (!hc) return { workouts: [], metrics: [] };
  await hc.initialize();
  const at = window(since);
  const [workouts, metrics] = await Promise.all([
    readWorkouts(hc, at),
    readMetrics(hc, at),
  ]);
  return { workouts, metrics };
}
