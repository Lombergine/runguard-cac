/**
 * The contract every segment codes against. Agents IMPORT from here and must
 * not redefine these shapes locally — that is what lets independently-built
 * pieces recombine.
 *
 * Two halves:
 *   1. Server data — the subset of GET /api/mobile/me the app actually uses.
 *   2. Component props — the shared UI vocabulary.
 */

/* ------------------------------------------------------------------ *
 * 1. Server data
 * ------------------------------------------------------------------ */

/** Advisory state. `unknown` is derived client-side; the server never sends it. */
export type Flag = "clear" | "watch" | "unusual" | "unknown";

/** What the server returns — note it has no `unknown`. */
export type ServerFlag = Exclude<Flag, "unknown">;

export type PrePractice = {
  flag: ServerFlag;
  /** Coach-facing, third person ("They reported…"). Do NOT show to an athlete. */
  reason: string;
  /** Athlete-facing phrasing of the same observation. */
  athleteReason?: string;
};

export type SorenessEntry = { part: string; severity: number };

export type CheckinRow = {
  id: number;
  athlete_id: number;
  date: string;
  rpe: number | null;
  energy: number | null;
  motivation: number | null;
  academic_stress: number | null;
  soreness_part: string | null;
  soreness_severity: number | null;
};

export type SessionSpike = {
  km: number;
  longestKm: number;
  pctAbove: number;
  level: "notable" | "large";
};

export type RecentRun = {
  id: number;
  /** Local day, YYYY-MM-DD. Note: no time-of-day exists in the payload. */
  date: string;
  /** KILOMETRES. Always convert through lib/units before display. */
  km: number;
  durationS: number;
  spike: SessionSpike | null;
};

export type PlanDay = {
  date: string;
  type: string;
  distanceKm: number | null;
  isToday: boolean;
  status: "done" | "modified" | "skipped" | null;
};

/**
 * Wearable-derived recovery. Mirrors `RecoverySnapshot` in
 * website/src/lib/risk.ts.
 *
 * Every metric is independently nullable: null means never recorded, and must
 * render through `Absent` — never as 0, and never as a healthy-looking blank.
 * `hasData` is false when the athlete has no wearable data at all.
 */
export type RecoverySnapshot = {
  /** Beats per minute. */
  restingHr: number | null;
  restingHrBaseline: number | null;
  /** Recent minus baseline, bpm. Positive = resting HR is elevated. */
  restingHrDelta: number | null;
  /** Milliseconds. */
  hrv: number | null;
  hrvBaseline: number | null;
  /** Percent off baseline. Negative = HRV suppressed. */
  hrvDeltaPct: number | null;
  /** Hours per night, mean of the last 7 days. */
  sleepAvg: number | null;
  vo2max: number | null;
  hasData: boolean;
};

/**
 * One upcoming race. Carries the raw `races` row (snake_case, straight from the
 * database) plus four server-derived fields.
 */
export type UpcomingRace = {
  id: number;
  /** The meet's name, e.g. "Central League Championships". */
  name: string;
  /** Local day, YYYY-MM-DD. Format through lib/dates before display. */
  date: string;
  /** The distance contested, e.g. "5K". */
  event: string;
  distance_m: number;
  location: string | null;
  /** null = coach- or seed-created. */
  created_by_athlete_id: number | null;
  team_id: number | null;
  /** Whole days from today; 0 is race day, and past races are not sent. */
  daysUntil: number;
  /** Split-by-split advice, one sentence per entry. */
  pacing: string[];
  /** Pre-formatted predicted time, e.g. "18:42". Never a bare number. */
  predicted: string;
  /** False for coach-created races — the athlete may not edit those. */
  canEdit: boolean;
};

/** A server-composed nudge. Advisory copy; render it as description, not alarm. */
export type Notification = {
  type: string;
  text: string;
  severity: "info" | "warning" | "critical";
};

/**
 * The max heart rate every intensity in the snapshot was scored against.
 * Mirrors `HrMaxResolution` in website/src/lib/hrmax.ts (minus `sessions`).
 *
 * `label` is the server's own sentence about where the number came from; show
 * it whenever the number is shown. `source` is NOT that sentence — never print
 * the enum. An "age" or "default" value is an estimate about the athlete, not a
 * measurement of them, so it must not be dressed as one.
 */
export type HrMax = {
  /** Beats per minute. */
  value: number;
  source: "manual" | "calibrated" | "detected" | "age" | "default";
  /** Short human-readable explanation, e.g. "estimated from age". */
  label: string;
};

/**
 * One day of the training-load series. Mirrors `DailyPoint` in
 * website/src/lib/risk.ts.
 *
 * `acwr` is null until there is enough history — that null is "we don't know",
 * and must render dashed, never as a gap in the line that reads as zero load.
 */
export type DailyPoint = {
  /** Local day, YYYY-MM-DD. Format through lib/dates before display. */
  date: string;
  load: number;
  /** KILOMETRES. Always convert through lib/units before display. */
  km: number;
  minutes: number;
  acute: number;
  chronic: number;
  acwr: number | null;
};

/** Minutes in each HR zone. Mirrors `ZoneMinutes` in website/src/lib/engine.ts. */
export type ZoneMinutes = { z1: number; z2: number; z3: number; z4: number; z5: number };

/**
 * Fitness, form and tier. The subset of `Fitness`
 * (website/src/lib/engine.ts) the app consumes.
 *
 * `score` and `freshness` are 0–100 model outputs, not measurements, and
 * `tier` is a bucket of `score` — none of them is a verdict on the athlete.
 * `vo2max` is null when no wearable ever reported one: `Absent`, never 0.
 */
export type Fitness = {
  score: number;
  tier: "Elite" | "Advanced" | "Intermediate" | "Developing";
  /** Season trend line; `week` is already a formatted label, e.g. "Mar 3". */
  weekly: { week: string; score: number }[];
  /** 0–100 form / "Body Battery". Higher = fresher. */
  freshness: number;
  vo2max: number | null;
};

/**
 * Detected training patterns. Mirrors `Patterns` in website/src/lib/engine.ts.
 *
 * `overreaching` / `undertraining` are observations, not instructions — copy
 * them as description. Every nullable here means "not enough data": null
 * `monotony` is not a low monotony, and null `sleepDebtH` is not a slept-well.
 */
export type Patterns = {
  /** Consecutive days above this athlete's own typical load. */
  highEffortStreak: number;
  monotony: number | null;
  overreaching: boolean;
  undertraining: boolean;
  /** Hours accumulated against an 8h target over the last 7 days. */
  sleepDebtH: number | null;
  /** 0–100. */
  sleepConsistency: number | null;
  daysSinceHardEffort: number | null;
};

/**
 * One night. Mirrors `SleepDay` in website/src/lib/engine.ts. Every stage is
 * independently nullable — a watch worn without sleep tracking reports `hours`
 * and nothing else.
 */
export type SleepDay = {
  date: string;
  /** Hours. */
  hours: number | null;
  deep: number | null;
  rem: number | null;
  light: number | null;
};

/**
 * One day of self-report. Mirrors `MentalDay` in website/src/lib/engine.ts.
 *
 * `stress` is a boolean the server already derived; `energy` and `motivation`
 * are null on days with no check-in — a missing day is not a bad day.
 */
export type MentalDay = {
  date: string;
  energy: number | null;
  motivation: number | null;
  stress: boolean;
};

/** Season bests. Mirrors `PersonalStats` in website/src/lib/athleteView.ts. */
export type PersonalStats = {
  /** KILOMETRES. Convert through lib/units. */
  biggestWeekKm: number;
  /** KILOMETRES. Convert through lib/units. */
  longestRunKm: number;
  /** Pre-formatted, e.g. "4:12/km". Never a bare number. */
  fastestPace: string | null;
  runsLast30: number;
};

/**
 * A logged injury. `resolved_at` null means still open — that is the only
 * difference between a current and a past injury, so never drop the field.
 */
export type Injury = {
  id: number;
  /** Local day, YYYY-MM-DD. Format through lib/dates before display. */
  date: string;
  /** Vocabulary from lib/bodyParts. */
  body_part: string;
  note: string | null;
  resolved_at: string | null;
};

/** One finished race. Mirrors `CoreProfile.races.history[number]`. */
export type RaceHistoryEntry = {
  id: number;
  event: string;
  /** Local day, YYYY-MM-DD. Format through lib/dates before display. */
  date: string;
  /** Pre-formatted finishing time, e.g. "18:42". Never a bare number. */
  time: string;
  timeS: number;
  place: number | null;
  feel: string | null;
  /** Per-split seconds, or null when none were recorded. */
  splits: number[] | null;
  conditions: string | null;
  isPr: boolean;
};

/** A point on a PR progression line. `timeS` is seconds — format before display. */
export type PrPoint = { date: string; timeS: number };

/** The slice of CoreProfile the app consumes. The endpoint returns much more. */
export type Profile = {
  /**
   * HAZARD — `/api/mobile/me` and `/api/mobile/home` both send
   * `athlete.deviceToken` inside this object. It is the bearer credential the
   * app authenticates with, and it is DELIBERATELY NOT DECLARED HERE so that
   * no component can reach it: it must never be rendered, logged, put in a
   * debug dump, or included in a screenshot or share sheet. If you find
   * yourself widening this object to add it, that is the bug.
   */
  athlete: {
    id: number;
    name: string;
    grade: number | null;
    school: string;
    teamName: string | null;
    hue: number;
    /** Events contested, e.g. ["800m", "Mile", "5K", "XC 5K"]. */
    events?: string[];
  };
  /** ALWAYS a number, and 100 when nothing is known. Never render directly. */
  readiness: number;
  prePractice: PrePractice;
  todayCheckin: CheckinRow | null;
  todaySoreness: SorenessEntry[];
  recentRuns: RecentRun[];
  plan: { days: PlanDay[] };
  risk: {
    hasActivityHistory: boolean;
    weekKm: number;
    recovery: RecoverySnapshot;
    selfReport: { hasData: boolean; daysSinceReport: number | null };
    /** The HRmax every intensity in this snapshot was scored against. */
    hrMax?: HrMax;
    /**
     * Daily load, oldest first, 120 days. Note this is NOT the trimmed
     * top-level `series` /me also sends — this one rides inside `risk` at full
     * width. Days with no run are present with `load: 0`; a day genuinely
     * missing from the array is unknown, not a rest day.
     */
    series?: DailyPoint[];
  };
  /**
   * This week's mileage goal, in KILOMETRES — the denominator for `risk.weekKm`.
   * Convert both through lib/units before display.
   */
  weeklyTargetKm?: number;
  /** One server-written sentence about this athlete's current training. */
  aiInsight?: string;
  notifications?: Notification[];

  /* ---- Already in /api/mobile/me, previously unread. All optional so that
   * code compiled against the narrower Profile keeps compiling; a screen that
   * wants one of these must handle it being undefined, because /home does not
   * send most of them. ---------------------------------------------------- */

  fitness?: Fitness;
  patterns?: Patterns;
  /** Last 30 nights, oldest first. Sparse: only days a metric was recorded. */
  sleep30?: SleepDay[];
  /** Last 30 days of check-ins, oldest first. Sparse in the same way. */
  mental30?: MentalDay[];
  /**
   * The server's illness heuristic (elevated resting HR + suppressed HRV).
   * A signal, not a diagnosis: describe it, never instruct on it, and never
   * style it as an alarm.
   */
  illness?: boolean;
  /** Athlete-facing observations, second person, one sentence each. */
  insights?: string[];
  /** Newest first is NOT guaranteed — sort before rendering. */
  injuries?: Injury[];
  /** Season bests. */
  stats?: PersonalStats;
  /**
   * Only the zone breakdown is taken from /me's fuller `load` object; the rest
   * of it duplicates `risk` (weekKm, acwr, acute/chronic) and would give two
   * places to read one number.
   */
  load?: { weekZones: ZoneMinutes };
  /**
   * /me's full `races`. The whole object is optional because /home's payload
   * is not /me's, but `upcoming` stays required INSIDE it: both endpoints
   * always send that leg (possibly empty), and keeping it required is what
   * lets this declaration and `ProfileWithNextRace`'s intersect — and what
   * keeps the races screen's `Omit<Profile, "races">` shape assignable.
   */
  races?: {
    upcoming: UpcomingRace[];
    /** Finished races. Order is not guaranteed — sort before rendering. */
    history?: RaceHistoryEntry[];
    /** Keyed by event name; each list is improvements only, oldest first. */
    prProgression?: Record<string, PrPoint[]>;
  };
};

/**
 * `Profile` with the next race attached — the shape `GET /api/mobile/home`
 * returns, where `races.upcoming` holds at most one entry.
 *
 * `races` deliberately lives here and not on `Profile`: /me's `races` also
 * carries `history` and `prProgression`, the races screen already intersects
 * that fuller shape onto `Profile`, and two disagreeing declarations of one key
 * do not intersect. Home code takes this type; everything else keeps `Profile`.
 *
 * Since then `Profile.races` has grown the full /me shape, declared so that the
 * two declarations still agree rather than collide: `upcoming` is required in
 * both, so the intersection is just `Profile`'s object with `history` and
 * `prProgression` still optional. Home code is unchanged, and this type stays
 * the one home takes — it is what documents that `upcoming` holds at most one
 * entry there.
 */
export type ProfileWithNextRace = Profile & {
  races?: { upcoming: UpcomingRace[] };
};

/* ------------------------------------------------------------------ *
 * 2. Derived state — the guards that stop a blank reading as healthy
 * ------------------------------------------------------------------ */

/**
 * Readiness is only knowable once the athlete has checked in. The server
 * cannot express this: readinessScore() returns 100 for an athlete with no
 * check-in and no wearable data. Everything renders through this type.
 */
export type ReadinessState =
  | { known: false }
  | { known: true; value: number };

/* ------------------------------------------------------------------ *
 * 3. Component props
 * ------------------------------------------------------------------ */

/**
 * The three kinds of nothing. Three SEPARATE components, never one with a
 * variant prop — a prop is how they drift into each other.
 */
export type AbsentProps = {
  /** Defaults to "Not recorded". */
  label?: string;
  /** Optional micro-label above the slot. */
  eyebrow?: string;
};

export type ZeroProps = {
  /** Rendered welded to the numeral, e.g. "mi" → "0 mi". */
  unit: string;
  eyebrow?: string;
};

export type NoRunProps = {
  /** Defaults to "No run. Rest day." */
  label?: string;
  eyebrow?: string;
};

export type StatusDotProps = {
  flag: Flag;
  /** Diameter. Defaults to 12. */
  size?: number;
};

export type AdvisoryProps = {
  flag: Flag;
  /** One plain-English sentence, descriptive and past tense. */
  reason: string;
};

export type CardProps = {
  children: React.ReactNode;
  /** Omits the default 16px padding when false. */
  padded?: boolean;
};

export type StatProps = {
  /** Micro-label, e.g. "DISTANCE". */
  label: string;
  /**
   * Pre-formatted WITH its unit welded on, e.g. "4.2 mi", "38:12", "8:51 /mi".
   * Never pass a bare numeral and render the unit separately.
   */
  value: string;
};

export type RunCardProps = {
  run: RecentRun;
  /** Pre-formatted local date, e.g. "Tue 14 Oct". Never derived in-component. */
  dateLabel: string;
  /** Session type from the matching plan day, e.g. "Long run". */
  sessionLabel?: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  /**
   * True when this row was produced by a safety intercept. Such a message MUST
   * render through SafetyNotice and must never reach ChatBubble.
   */
  safety: boolean;
};

export type SafetyNoticeProps = {
  text: string;
};

/** Deliberately cannot accept a message flagged `safety`. */
export type ChatBubbleProps = {
  role: "user" | "assistant";
  text: string;
};

export type BodyMapProps = {
  /** Body-part keys currently selected, from lib/bodyParts. */
  selected: string[];
  onToggle: (partKey: string) => void;
  /** Severity by part key, 0–10, for display intensity. */
  severity?: Record<string, number>;
};
