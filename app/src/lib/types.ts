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

/** The slice of CoreProfile the app consumes. The endpoint returns much more. */
export type Profile = {
  athlete: {
    id: number;
    name: string;
    grade: number | null;
    school: string;
    teamName: string | null;
    hue: number;
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
  };
  /**
   * This week's mileage goal, in KILOMETRES — the denominator for `risk.weekKm`.
   * Convert both through lib/units before display.
   */
  weeklyTargetKm?: number;
  /** One server-written sentence about this athlete's current training. */
  aiInsight?: string;
  notifications?: Notification[];
};

/**
 * `Profile` with the next race attached — the shape `GET /api/mobile/home`
 * returns, where `races.upcoming` holds at most one entry.
 *
 * `races` deliberately lives here and not on `Profile`: /me's `races` also
 * carries `history` and `prProgression`, the races screen already intersects
 * that fuller shape onto `Profile`, and two disagreeing declarations of one key
 * do not intersect. Home code takes this type; everything else keeps `Profile`.
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
