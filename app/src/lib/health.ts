/**
 * HealthKit → `POST /api/mobile/ingest`. The app's whole premise.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS CAN AND CANNOT DO TODAY
 *
 * Reading Health data needs three things, and only the first is in this repo:
 *
 *   1. the native module — `@kingstinct/react-native-healthkit` (installed),
 *      which is a Nitro module: it does NOT exist in Expo Go, and it is not in
 *      `ios/` until `npx expo prebuild` + `pod install` have been run;
 *   2. the `com.apple.developer.healthkit` ENTITLEMENT, which needs an Apple
 *      Developer account. `ios/RunGuard/RunGuard.entitlements` is an empty
 *      dict right now, so no build made from the checked-in project can read
 *      Health at all;
 *   3. a PHYSICAL device. The Simulator has no Health database and no Health
 *      app; nothing is ever returned there.
 *
 * So every entry point below is gated on `availability()`, and the screen is
 * required to say which of those is missing rather than showing a dead button.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY "PERMISSION GRANTED" IS NOT A THING WE CAN KNOW
 *
 * Apple deliberately never discloses READ denial: `requestAuthorization`
 * resolves the same way whether the athlete allowed everything or nothing, and
 * `authorizationStatusFor` reports SHARE status only. A denied read type simply
 * returns zero samples, which is indistinguishable from "this athlete has no
 * data".
 *
 * That is why `HealthState` records what was actually READ as well as what was
 * imported, and why nothing here returns a `connected: true`. The screen may
 * say "we read N workouts"; it may not say "connected" on the strength of a
 * permission prompt having been shown.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SAFETY
 *
 * Nothing in this file logs. Not the session token (same rule as `lib/auth.ts`:
 * it is a minor's credential), and not raw health samples either — a resting
 * heart rate in a crash report is still a health record. Thrown values from
 * `fetch` can echo the request with its Authorization header, so they are
 * discarded rather than re-used, exactly as `lib/api.ts` and `app/login.tsx`
 * do.
 */
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  CategoryValueSleepAnalysis,
  WorkoutActivityType,
  WorkoutTypeIdentifier,
  type ObjectTypeIdentifier,
} from "@kingstinct/react-native-healthkit/types";

import { BASE_URL } from "./api";
import { getToken } from "./auth";
import { localDay } from "./dates";

/* ------------------------------------------------------------------ *
 * The wire shapes. Keyed to website/src/app/api/mobile/ingest/route.ts.
 * ------------------------------------------------------------------ */

/**
 * One workout row.
 *
 * `start` and `durationS` are BOTH required by the route — it `continue`s past
 * any entry missing either, silently, so a wrong shape here looks like an
 * athlete with no runs rather than an error.
 *
 * `distanceM` is METRES (the rest of the app speaks kilometres; do not send
 * `km` here). `id` becomes `external_id`, and the UNIQUE constraint is
 * (athlete_id, source, external_id) — sending HealthKit's own sample uuid is
 * what makes re-syncing the same window free.
 */
export type IngestWorkout = {
  id: string;
  name: string;
  type: string;
  /** ISO 8601. */
  start: string;
  durationS: number;
  /** METRES. */
  distanceM: number;
  /** BPM, mean over the workout. Absent when no heart-rate sample overlapped it. */
  avgHr?: number;
  /** BPM, peak over the workout — this is what `hrmax.ts` `detectHrMax()` reads. */
  maxHr?: number;
};

/**
 * One day of recovery metrics.
 *
 * `date` is a LOCAL calendar day, `YYYY-MM-DD` — the route slices the first ten
 * characters and rejects anything that is not that shape. An ISO instant would
 * file an evening reading under tomorrow in every US timezone, which is the bug
 * `lib/dates` exists to prevent.
 *
 * Every field is optional and independently absent: a watch worn without sleep
 * tracking reports `restingHr` and nothing else, and the server stores null
 * (never 0) for what it did not receive.
 */
export type IngestMetric = {
  date: string;
  restingHr?: number;
  hrv?: number;
  /** Hours actually asleep — awake time and in-bed time excluded. */
  sleepHours?: number;
  vo2max?: number;
  respRate?: number;
  sleepDeep?: number;
  sleepRem?: number;
  sleepLight?: number;
};

export type IngestPayload = {
  workouts: IngestWorkout[];
  metrics: IngestMetric[];
};

/* ------------------------------------------------------------------ *
 * Availability
 * ------------------------------------------------------------------ */

/**
 * Why HealthKit is unusable, when it is.
 *
 * `noModule` is the one that covers the Simulator in practice, and it is
 * deliberately not called "simulator": with only `expo-constants` in this tree
 * there is no way to tell a Simulator from a device, and guessing wrong would
 * be the screen lying about the athlete's phone. The three reasons below are
 * the ones that are actually observable.
 */
export type Availability =
  | { ok: true }
  /** Android or web. HealthKit is iOS-only. */
  | { ok: false; reason: "notIos" }
  /** The native module is not in this build — Expo Go, or no prebuild yet. */
  | { ok: false; reason: "noModule" }
  /** The module loaded but iOS says this device has no Health store. */
  | { ok: false; reason: "noHealthStore" };

type HealthkitApi = typeof import("@kingstinct/react-native-healthkit");

/**
 * `undefined` = not tried yet, `null` = tried and absent.
 *
 * The require is lazy and guarded because the package builds its Nitro hybrid
 * objects at MODULE SCOPE (`src/modules.ts`): a plain top-level import of it
 * throws while the bundle is evaluating on any build without the native side,
 * which takes down the whole app rather than just this screen.
 */
let cachedApi: HealthkitApi | null | undefined;

function api(): HealthkitApi | null {
  if (cachedApi !== undefined) return cachedApi;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedApi = require("@kingstinct/react-native-healthkit") as HealthkitApi;
  } catch {
    cachedApi = null;
  }
  return cachedApi;
}

export function availability(): Availability {
  if (Platform.OS !== "ios") return { ok: false, reason: "notIos" };
  const hk = api();
  if (!hk) return { ok: false, reason: "noModule" };
  try {
    if (!hk.isHealthDataAvailable()) return { ok: false, reason: "noHealthStore" };
  } catch {
    return { ok: false, reason: "noModule" };
  }
  return { ok: true };
}

/** False on Android, false without the native module, false on a device with no Health store. */
export function isAvailable(): boolean {
  return availability().ok;
}

/* ------------------------------------------------------------------ *
 * Read scopes
 * ------------------------------------------------------------------ */

/**
 * Read-only. `toShare` is deliberately empty — the app writes nothing back, and
 * asking for write access it does not use would be a permission prompt the
 * athlete cannot refuse selectively.
 *
 * `HKQuantityTypeIdentifierHeartRate` IS requested — a deliberate scope decision,
 * not a default. It exists so `readSince()` can compute a real max heart rate per
 * workout (`workout.maxHr` below) and retire the manual-entry field in
 * `app/profile.tsx`: HRmax sits upstream of every intensity, load and ACWR figure
 * the engine computes, so an athlete's own workout history is a better source
 * than a number they typed once. This widens what the permission sheet asks for
 * — every heart-rate sample, not just workout summaries — which matters more on
 * a roster of minors than it would elsewhere. `cadence` is still never sent:
 * nothing in this file reads it, on principle that a scope is requested because
 * something uses it, not because the type exists.
 */
const READ_SCOPES = [
  WorkoutTypeIdentifier,
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKQuantityTypeIdentifierVO2Max",
  "HKQuantityTypeIdentifierRespiratoryRate",
] as const satisfies readonly ObjectTypeIdentifier[];

/**
 * Shows the Health permission sheet and records that it was shown.
 *
 * Resolves whether or not the athlete allowed anything — see the header. Throws
 * `HealthError("unavailable")` if HealthKit is not usable on this build.
 */
export async function requestPermissions(): Promise<void> {
  const hk = api();
  if (!hk || !isAvailable()) throw new HealthError("unavailable");
  try {
    await hk.requestAuthorization({ toRead: READ_SCOPES });
  } catch {
    // The rejection can carry the type list; it says nothing the athlete can
    // act on, and a denial looks identical to a success anyway.
    throw new HealthError("unavailable");
  }
  await saveState({ ...(await getState()), requestedAt: new Date().toISOString() });
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/**
 * The activity types the server's Apple-export importer keeps
 * (`website/src/lib/appleHealth.ts:30`), with the labels it produces, so a run
 * imported through the phone and the same run imported from an export.zip do
 * not end up named two different things in one athlete's history.
 */
const WORKOUT_TYPES: Partial<Record<WorkoutActivityType, string>> = {
  [WorkoutActivityType.running]: "Running",
  [WorkoutActivityType.walking]: "Walking",
  [WorkoutActivityType.hiking]: "Hiking",
  [WorkoutActivityType.crossTraining]: "Cross Training",
  [WorkoutActivityType.elliptical]: "Elliptical",
  [WorkoutActivityType.cycling]: "Cycling",
};

/**
 * Same floor the export importer uses. An Apple Watch logs auto-detected
 * two-minute walks; counting those as sessions inflates the training-load and
 * ACWR figures the risk engine is built on.
 */
const MIN_WORKOUT_S = 300;

/** Sleep segments longer than this are a stuck sensor, not a night. */
const MAX_SLEEP_SEGMENT_H = 16;

type Mean = { sum: number; n: number };

type DayAcc = {
  restingHr: Mean;
  hrv: Mean;
  respRate: Mean;
  vo2max: number | null;
  deep: number;
  rem: number;
  light: number;
  unstaged: number;
  sleepSeen: boolean;
};

function emptyDay(): DayAcc {
  return {
    restingHr: { sum: 0, n: 0 },
    hrv: { sum: 0, n: 0 },
    respRate: { sum: 0, n: 0 },
    vo2max: null,
    deep: 0,
    rem: 0,
    light: 0,
    unstaged: 0,
    sleepSeen: false,
  };
}

function mean(m: Mean, dp: number): number | undefined {
  if (m.n === 0) return undefined;
  const f = 10 ** dp;
  return Math.round((m.sum / m.n) * f) / f;
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/**
 * Everything HealthKit holds from `since` up to now, in the exact shapes the
 * ingest route reads.
 *
 * Returns empty arrays rather than throwing when HealthKit is unusable — the
 * caller decides whether that is worth showing — but a query that fails once
 * the module IS present is a real failure and throws.
 */
export async function readSince(since: Date): Promise<IngestPayload> {
  const hk = api();
  if (!hk || !isAvailable()) return { workouts: [], metrics: [] };

  const date = { startDate: since };

  let workouts: IngestWorkout[];
  const days = new Map<string, DayAcc>();
  const day = (iso: string): DayAcc => {
    const existing = days.get(iso);
    if (existing) return existing;
    const fresh = emptyDay();
    days.set(iso, fresh);
    return fresh;
  };

  try {
    const samples = await hk.queryWorkoutSamples({ filter: { date }, limit: 0 });
    workouts = [];
    for (const w of samples) {
      const name = WORKOUT_TYPES[w.workoutActivityType];
      if (!name) continue;
      const durationS = Math.round(w.duration.quantity);
      if (!Number.isFinite(durationS) || durationS <= MIN_WORKOUT_S) continue;
      workouts.push({
        // HealthKit's own uuid, so re-reading an overlapping window inserts
        // nothing new instead of duplicating the session.
        id: w.uuid,
        name,
        type: name,
        start: w.startDate.toISOString(),
        durationS,
        // `totalDistance` is absent on a workout recorded without distance.
        // Zero is correct there: the route stores 0, not null, for distance.
        distanceM: Math.round(w.totalDistance?.quantity ?? 0),
      });
    }

    const [restingHr, hrv, respRate, vo2max, heartRate] = await Promise.all([
      hk.queryQuantitySamples("HKQuantityTypeIdentifierRestingHeartRate", {
        filter: { date },
        limit: 0,
        unit: "count/min",
      }),
      hk.queryQuantitySamples("HKQuantityTypeIdentifierHeartRateVariabilitySDNN", {
        filter: { date },
        limit: 0,
        unit: "ms",
      }),
      // Explicit, because this identifier's DEFAULT unit is `count/s`; taken
      // unlabelled it would report a resting athlete at 0.25 breaths.
      hk.queryQuantitySamples("HKQuantityTypeIdentifierRespiratoryRate", {
        filter: { date },
        limit: 0,
        unit: "count/min",
      }),
      hk.queryQuantitySamples("HKQuantityTypeIdentifierVO2Max", {
        filter: { date },
        limit: 0,
        unit: "ml/(kg*min)",
        ascending: true,
      }),
      // Every live heart-rate sample in the window — this is the one that feeds
      // `workout.avgHr` / `workout.maxHr` below, not a per-day mean like the
      // others here. Ascending so the per-workout scan below can rely on order.
      hk.queryQuantitySamples("HKQuantityTypeIdentifierHeartRate", {
        filter: { date },
        limit: 0,
        unit: "count/min",
        ascending: true,
      }),
    ]);

    // Attribute heart-rate samples to the workout whose time window contains
    // them. A nested scan rather than a merge-pointer: workouts are HealthKit's
    // own order, not necessarily start-ascending, and a 30-day backfill is at
    // most a few dozen workouts against at most a few thousand HR samples — not
    // worth the bug surface of a pointer that has to rewind for an out-of-order
    // workout. `avgHr`/`maxHr` stay ABSENT (never 0) when no sample overlapped,
    // matching every other optional reading in this file.
    for (const w of workouts) {
      const startMs = Date.parse(w.start);
      const endMs = startMs + w.durationS * 1000;
      let sum = 0;
      let n = 0;
      let max = 0;
      for (const s of heartRate) {
        const t = s.startDate.getTime();
        if (t < startMs || t > endMs) continue;
        sum += s.quantity;
        n++;
        if (s.quantity > max) max = s.quantity;
      }
      if (n > 0) {
        w.avgHr = Math.round(sum / n);
        w.maxHr = Math.round(max);
      }
    }

    for (const s of restingHr) {
      const acc = day(localDay(s.startDate)).restingHr;
      acc.sum += s.quantity;
      acc.n++;
    }
    for (const s of hrv) {
      const acc = day(localDay(s.startDate)).hrv;
      acc.sum += s.quantity;
      acc.n++;
    }
    for (const s of respRate) {
      const acc = day(localDay(s.startDate)).respRate;
      acc.sum += s.quantity;
      acc.n++;
    }
    // Last of the day wins, matching the export importer. VO2max is a single
    // periodic estimate, not something to average.
    for (const s of vo2max) day(localDay(s.startDate)).vo2max = s.quantity;

    const sleep = await hk.queryCategorySamples("HKCategoryTypeIdentifierSleepAnalysis", {
      filter: { date },
      limit: 0,
    });
    for (const s of sleep) {
      const hours = (s.endDate.getTime() - s.startDate.getTime()) / 3_600_000;
      if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_SLEEP_SEGMENT_H) continue;
      // Filed under the day the athlete WOKE UP, which is how the server's
      // export importer files it and how a night is talked about.
      const acc = day(localDay(s.endDate));
      switch (s.value) {
        case CategoryValueSleepAnalysis.asleepDeep:
          acc.deep += hours;
          acc.sleepSeen = true;
          break;
        case CategoryValueSleepAnalysis.asleepREM:
          acc.rem += hours;
          acc.sleepSeen = true;
          break;
        case CategoryValueSleepAnalysis.asleepCore:
          acc.light += hours;
          acc.sleepSeen = true;
          break;
        case CategoryValueSleepAnalysis.asleepUnspecified:
          acc.unstaged += hours;
          acc.sleepSeen = true;
          break;
        // `inBed` and `awake` are not sleep and are not counted.
      }
    }
  } catch {
    // Never re-use the thrown value: a HealthKit error can quote the samples it
    // was reading.
    throw new HealthError("read");
  }

  const metrics: IngestMetric[] = [];
  for (const [date_, a] of [...days].sort((x, y) => x[0].localeCompare(y[0]))) {
    const m: IngestMetric = { date: date_ };
    const rhr = mean(a.restingHr, 1);
    if (rhr !== undefined) m.restingHr = rhr;
    const h = mean(a.hrv, 1);
    if (h !== undefined) m.hrv = h;
    const rr = mean(a.respRate, 1);
    if (rr !== undefined) m.respRate = rr;
    if (a.vo2max !== null) m.vo2max = round(a.vo2max, 1);
    if (a.sleepSeen) m.sleepHours = round(a.deep + a.rem + a.light + a.unstaged, 2);
    if (a.deep) m.sleepDeep = round(a.deep, 2);
    if (a.rem) m.sleepRem = round(a.rem, 2);
    if (a.light) m.sleepLight = round(a.light, 2);
    // A day the map only knows about because of an ignored awake segment has
    // nothing to say. Sending `{ date }` alone would write a row of nulls.
    if (Object.keys(m).length > 1) metrics.push(m);
  }

  return { workouts, metrics };
}

/* ------------------------------------------------------------------ *
 * Uploading
 * ------------------------------------------------------------------ */

/** Every way a sync can fail. Each one has a different fix, so they stay apart. */
export type HealthFailure =
  /** HealthKit is not usable on this build or device. */
  | "unavailable"
  /** The query itself failed. */
  | "read"
  /** No session token, or the server rejected it. Sign in again. */
  | "unauthorized"
  /** Server unreachable, wrong LAN address, or timed out. */
  | "network"
  /** The server answered, badly. Retrying is safe — see `sync`. */
  | "server";

export class HealthError extends Error {
  readonly kind: HealthFailure;
  constructor(kind: HealthFailure) {
    super(kind);
    this.name = "HealthError";
    this.kind = kind;
  }
}

/** The route's silent caps. Anything past them is dropped without a word. */
const WORKOUT_CAP = 1000;
const METRIC_CAP = 800;

/** Matches lib/api: no health endpoint exists, so a bad base URL just hangs. */
const TIMEOUT_MS = 30_000;

type IngestResult = {
  importedWorkouts: number;
  importedMetrics: number;
  rejectedWorkouts: number;
  rejectedMetrics: number;
};

/**
 * One POST. `importedWorkouts` counts rows that were actually INSERTED —
 * `ON CONFLICT DO NOTHING` means an already-known workout counts zero.
 *
 * `rejected*` counts entries the server REFUSED, and is read for the reason the
 * route gives for sending it: `imported` alone cannot tell "your server already
 * had this one" from "your server threw this one away". Both are zero imports.
 * A refused workout is not retried into existence either — once this sync
 * succeeds, `lastSync.at` advances and the next `since` only reaches back
 * OVERLAP_DAYS, so anything older than that window is gone for good. Dropping
 * these counts on the floor is what made that loss silent.
 */
async function postIngest(payload: IngestPayload): Promise<IngestResult> {
  const token = await getToken();
  if (!token) throw new HealthError("unauthorized");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/mobile/ingest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    // Discarded, not surfaced: the thrown value can echo the whole request,
    // Authorization header and health payload included.
    throw new HealthError("network");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) throw new HealthError("unauthorized");
  if (!res.ok) throw new HealthError("server");

  const body = (await res.json().catch(() => null)) as Partial<IngestResult> | null;
  return {
    importedWorkouts: typeof body?.importedWorkouts === "number" ? body.importedWorkouts : 0,
    importedMetrics: typeof body?.importedMetrics === "number" ? body.importedMetrics : 0,
    rejectedWorkouts: typeof body?.rejectedWorkouts === "number" ? body.rejectedWorkouts : 0,
    rejectedMetrics: typeof body?.rejectedMetrics === "number" ? body.rejectedMetrics : 0,
  };
}

/* ------------------------------------------------------------------ *
 * Sync
 * ------------------------------------------------------------------ */

/**
 * What one completed sync did.
 *
 * `read` and `imported` are BOTH kept because they answer different questions
 * and only the pair of them is honest:
 *
 *  - `imported.workouts` is 0 whenever nothing was NEW. On the second sync of
 *    an unchanged week that is the correct, healthy answer. It is not an error
 *    and must never be shown as one.
 *  - `read` is what HealthKit actually handed over. `read.workouts === 0` and
 *    `read.metrics === 0` together are the only signal the app has that read
 *    access may have been refused — because Apple does not tell us.
 */
export type SyncRecord = {
  /** ISO instant the sync finished. */
  at: string;
  read: { workouts: number; metrics: number };
  imported: { workouts: number; metrics: number };
  /**
   * What the server REFUSED — the third question, and the one that was missing.
   *
   * `read` and `imported` together still cannot distinguish "the server already
   * had all of it" from "the server threw some of it away": both read N and
   * import 0. Only this tells them apart, which is exactly why the route
   * reports it.
   *
   * OPTIONAL BECAUSE ABSENT IS NOT ZERO. A record persisted by a build that
   * predates this field, or answered by a server too old to send it, genuinely
   * does not know how many entries were refused — and `{workouts: 0}` would be
   * a claim that none were. Undefined means unknown; render nothing rather than
   * a reassuring zero. `sync()` always populates it.
   */
  rejected?: { workouts: number; metrics: number };
};

export type HealthState = {
  /** ISO instant the Health permission sheet was last shown, or null. */
  requestedAt: string | null;
  lastSync: SyncRecord | null;
};

const EMPTY_STATE: HealthState = { requestedAt: null, lastSync: null };

/**
 * SecureStore, not because any of this is secret — it is two timestamps and
 * four counts, no health values and no token — but because it is the only
 * persistent store in this tree, and adding a second storage dependency for
 * four integers is not worth it.
 */
const STATE_KEY = "runguard.health.state";

export async function getState(): Promise<HealthState> {
  let raw: string | null = null;
  try {
    raw = await SecureStore.getItemAsync(STATE_KEY);
  } catch {
    return EMPTY_STATE;
  }
  if (!raw) return EMPTY_STATE;
  try {
    return { ...EMPTY_STATE, ...(JSON.parse(raw) as Partial<HealthState>) };
  } catch {
    return EMPTY_STATE;
  }
}

async function saveState(state: HealthState): Promise<void> {
  // NOTHING IS WRITTEN BACK AFTER A SIGN-OUT. `clearAllStoredState()` erases
  // STATE_KEY along with the token, but a sync or a permission prompt already
  // in flight when that lands resolves afterwards and used to re-create the key
  // — restoring the previous athlete's last-sync date and their read/new counts
  // for whoever holds the phone next, which is the exact leak that erase exists
  // to close. `getToken()` is null once the session has ended (sign-out also
  // revokes the dev fallback), so no token means no write.
  if (!(await getToken())) return;
  try {
    await SecureStore.setItemAsync(STATE_KEY, JSON.stringify(state));
  } catch {
    // A locked keychain costs the "last synced" line, not the sync.
  }
}

/** How far back the very first sync reaches. */
const BACKFILL_DAYS = 30;

/**
 * Re-read window on every later sync. Today's metrics are still accumulating
 * when a sync runs, and watch samples land in Health hours late; the overlap is
 * free because workouts dedupe on uuid and metric days upsert by date.
 */
const OVERLAP_DAYS = 2;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Read, upload, record. The one call a screen needs.
 *
 * Paged rather than truncated: the route applies its 1000-workout and
 * 800-metric caps with `.slice()` and no warning, so a first-run backfill wider
 * than that would lose the overflow silently.
 *
 * Retrying after a `server` failure is safe. A 500 can mean a partial write,
 * but every insert dedupes on (athlete, source, uuid) and every metric day is
 * an upsert, so the second attempt finishes the job instead of doubling it.
 */
export async function sync(): Promise<SyncRecord> {
  if (!isAvailable()) throw new HealthError("unavailable");

  const before = await getState();
  const since = before.lastSync
    ? new Date(Date.parse(before.lastSync.at) - OVERLAP_DAYS * 86_400_000)
    : daysAgo(BACKFILL_DAYS);

  const { workouts, metrics } = await readSince(since);

  const imported = { workouts: 0, metrics: 0 };
  const rejected = { workouts: 0, metrics: 0 };
  for (let w = 0, m = 0; w < workouts.length || m < metrics.length; ) {
    const page = {
      workouts: workouts.slice(w, w + WORKOUT_CAP),
      metrics: metrics.slice(m, m + METRIC_CAP),
    };
    const result = await postIngest(page);
    imported.workouts += result.importedWorkouts;
    imported.metrics += result.importedMetrics;
    rejected.workouts += result.rejectedWorkouts;
    rejected.metrics += result.rejectedMetrics;
    w += page.workouts.length;
    m += page.metrics.length;
  }

  const record: SyncRecord = {
    at: new Date().toISOString(),
    read: { workouts: workouts.length, metrics: metrics.length },
    imported,
    rejected,
  };
  await saveState({ ...before, lastSync: record });
  return record;
}
