import AdmZip from "adm-zip";
import sax from "sax";

export type ParsedWorkout = {
  externalId: string;
  type: string;
  start: string; // ISO
  durationS: number;
  distanceM: number;
  avgHr: number | null;
};

export type ParsedMetric = {
  date: string; // YYYY-MM-DD (local day)
  restingHr: number | null;
  hrv: number | null;
  sleepHours: number | null;
  vo2max: number | null;
  respRate: number | null;
  spo2: number | null;
  wristTemp: number | null;
  sleepDeep: number | null;
  sleepRem: number | null;
  sleepLight: number | null;
  sleepAwake: number | null;
};

export type ParsedHealth = { workouts: ParsedWorkout[]; metrics: ParsedMetric[] };

const RUNNING_TYPES = new Set([
  "HKWorkoutActivityTypeRunning",
  "HKWorkoutActivityTypeWalking",
  "HKWorkoutActivityTypeHiking",
  "HKWorkoutActivityTypeCrossTraining",
  "HKWorkoutActivityTypeElliptical",
  "HKWorkoutActivityTypeCycling",
]);

function friendlyType(hk: string): string {
  return hk.replace("HKWorkoutActivityType", "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Apple's export dates look like "2026-07-01 16:30:00 -0700". */
function toMs(appleDate: string): number {
  const d = new Date(appleDate.replace(" ", "T").replace(" ", ""));
  return d.getTime();
}
function toIso(appleDate: string): string {
  const ms = toMs(appleDate);
  return isNaN(ms) ? new Date().toISOString() : new Date(ms).toISOString();
}
/** local calendar day = the date portion Apple already wrote in local time */
function localDay(appleDate: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(appleDate);
  return m ? m[1] : null;
}

/** running per-day accumulator that averages quantity samples and sums sleep stages */
type Acc = {
  rhrSum: number; rhrN: number;
  hrvSum: number; hrvN: number;
  respSum: number; respN: number;
  spo2Sum: number; spo2N: number;
  wristSum: number; wristN: number;
  vo2: number | null;
  deep: number; rem: number; light: number; awake: number; asleepUnstaged: number;
  sleepSeen: boolean;
};
function blank(): Acc {
  return {
    rhrSum: 0, rhrN: 0, hrvSum: 0, hrvN: 0, respSum: 0, respN: 0,
    spo2Sum: 0, spo2N: 0, wristSum: 0, wristN: 0, vo2: null,
    deep: 0, rem: 0, light: 0, awake: 0, asleepUnstaged: 0, sleepSeen: false,
  };
}

/**
 * Parse an Apple Health export (export.zip or export.xml) → workouts + daily recovery metrics.
 * Streams the XML through sax so large exports don't blow memory.
 */
export async function parseAppleHealthExport(
  data: Buffer,
  filename: string,
  range?: { start?: string; end?: string } // YYYY-MM-DD, inclusive — bounds an initial historical backfill
): Promise<ParsedHealth> {
  const inRange = (d: string) =>
    (!range?.start || d >= range.start) && (!range?.end || d <= range.end);
  let xml: Buffer;
  if (filename.toLowerCase().endsWith(".zip")) {
    const zip = new AdmZip(data);
    const entry =
      zip.getEntry("apple_health_export/export.xml") ||
      zip.getEntries().find((e) => e.entryName.endsWith("export.xml"));
    if (!entry) throw new Error("No export.xml found inside the zip.");
    xml = entry.getData();
  } else {
    xml = data;
  }

  return new Promise((resolve, reject) => {
    const workouts: ParsedWorkout[] = [];
    const byDay = new Map<string, Acc>();
    const day = (d: string) => {
      let a = byDay.get(d);
      if (!a) { a = blank(); byDay.set(d, a); }
      return a;
    };

    const parser = sax.createStream(false, { lowercase: true });

    let current: {
      type: string;
      start: string;
      durationS: number;
      distanceM: number;
      avgHr: number | null;
    } | null = null;

    parser.on("opentag", (node) => {
      const attrs = node.attributes as Record<string, string>;

      if (node.name === "workout") {
        const hkType = attrs.workoutactivitytype || "";
        if (!RUNNING_TYPES.has(hkType)) return;
        const durationMin = parseFloat(attrs.duration || "0");
        current = {
          type: friendlyType(hkType),
          start: toIso(attrs.startdate || ""),
          durationS: Math.round(durationMin * 60),
          distanceM: attrs.totaldistance
            ? parseFloat(attrs.totaldistance) *
              (attrs.totaldistanceunit === "mi" ? 1609.34 : 1000)
            : 0,
          avgHr: null,
        };
      } else if (node.name === "workoutstatistics" && current) {
        const t = attrs.type || "";
        if (
          t === "HKQuantityTypeIdentifierDistanceWalkingRunning" ||
          t === "HKQuantityTypeIdentifierDistanceCycling"
        ) {
          const sum = parseFloat(attrs.sum || "0");
          current.distanceM = sum * (attrs.unit === "mi" ? 1609.34 : 1000);
        } else if (t === "HKQuantityTypeIdentifierHeartRate") {
          const avg = parseFloat(attrs.average || "0");
          if (avg > 0) current.avgHr = avg;
        }
      } else if (node.name === "record") {
        const t = attrs.type || "";
        const val = parseFloat(attrs.value || "");
        const d = localDay(attrs.startdate || "");
        if (t === "HKCategoryTypeIdentifierSleepAnalysis") {
          const wake = localDay(attrs.enddate || attrs.startdate || "");
          if (!wake || !inRange(wake)) return;
          const hrs = (toMs(attrs.enddate || "") - toMs(attrs.startdate || "")) / 3600000;
          if (!isFinite(hrs) || hrs <= 0 || hrs > 16) return;
          const a = day(wake);
          const v = attrs.value || "";
          if (v.includes("Deep")) { a.deep += hrs; a.sleepSeen = true; }
          else if (v.includes("REM")) { a.rem += hrs; a.sleepSeen = true; }
          else if (v.includes("Core")) { a.light += hrs; a.sleepSeen = true; }
          else if (v.includes("Awake")) { a.awake += hrs; }
          else if (v.includes("Asleep")) { a.asleepUnstaged += hrs; a.sleepSeen = true; }
          // "InBed" ignored — we count actual asleep time
          return;
        }
        if (!d || isNaN(val) || !inRange(d)) return;
        const a = day(d);
        switch (t) {
          case "HKQuantityTypeIdentifierRestingHeartRate":
            a.rhrSum += val; a.rhrN++; break;
          case "HKQuantityTypeIdentifierHeartRateVariabilitySDNN":
            a.hrvSum += val; a.hrvN++; break;
          case "HKQuantityTypeIdentifierRespiratoryRate":
            a.respSum += val; a.respN++; break;
          case "HKQuantityTypeIdentifierOxygenSaturation":
            a.spo2Sum += val <= 1 ? val * 100 : val; a.spo2N++; break;
          case "HKQuantityTypeIdentifierAppleSleepingWristTemperature":
            a.wristSum += val; a.wristN++; break;
          case "HKQuantityTypeIdentifierVO2Max":
            a.vo2 = val; break;
        }
      }
    });

    parser.on("closetag", (name) => {
      if (name === "workout" && current) {
        if (current.durationS > 300 && inRange(current.start.slice(0, 10))) {
          workouts.push({ externalId: `${current.start}-${current.durationS}`, ...current });
        }
        current = null;
      }
    });

    parser.on("error", (err) => reject(err));
    parser.on("end", () => {
      const metrics: ParsedMetric[] = [];
      for (const [date, a] of byDay) {
        const asleep = a.deep + a.rem + a.light + a.asleepUnstaged;
        const hasAny =
          a.rhrN || a.hrvN || a.respN || a.spo2N || a.wristN || a.vo2 !== null || a.sleepSeen;
        if (!hasAny) continue;
        metrics.push({
          date,
          restingHr: a.rhrN ? Math.round((a.rhrSum / a.rhrN) * 10) / 10 : null,
          hrv: a.hrvN ? Math.round((a.hrvSum / a.hrvN) * 10) / 10 : null,
          sleepHours: a.sleepSeen ? Math.round(asleep * 100) / 100 : null,
          vo2max: a.vo2 !== null ? Math.round(a.vo2 * 10) / 10 : null,
          respRate: a.respN ? Math.round((a.respSum / a.respN) * 10) / 10 : null,
          spo2: a.spo2N ? Math.round((a.spo2Sum / a.spo2N) * 10) / 10 : null,
          wristTemp: a.wristN ? Math.round((a.wristSum / a.wristN) * 100) / 100 : null,
          sleepDeep: a.deep ? Math.round(a.deep * 100) / 100 : null,
          sleepRem: a.rem ? Math.round(a.rem * 100) / 100 : null,
          sleepLight: a.light ? Math.round(a.light * 100) / 100 : null,
          sleepAwake: a.awake ? Math.round(a.awake * 100) / 100 : null,
        });
      }
      metrics.sort((x, y) => x.date.localeCompare(y.date));
      resolve({ workouts, metrics });
    });

    // feed in chunks to keep string allocations bounded
    const CHUNK = 4 * 1024 * 1024;
    let offset = 0;
    function pump() {
      if (offset >= xml.length) {
        parser.end();
        return;
      }
      const slice = xml.subarray(offset, offset + CHUNK);
      offset += CHUNK;
      parser.write(slice.toString("utf8"));
      setImmediate(pump);
    }
    pump();
  });
}
