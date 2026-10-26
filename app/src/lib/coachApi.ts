/**
 * The coach side's HTTP client. The twin of `lib/api.ts`, for a different
 * credential and a different set of routes.
 *
 * WHY THIS IS A SEPARATE FILE AND NOT A FLAG ON `request()`.
 * `lib/api.ts`'s `request()` opens with `getToken()` and fails closed without an
 * ATHLETE token. Threading a "use the coach token instead" option through it
 * would put the two credentials one boolean apart on every call site in the
 * app — and the failure mode of getting that boolean wrong is sending a coach
 * token, which reaches an entire team, to a route scoped to one athlete. Two
 * files cannot make that mistake.
 *
 * The same reasoning runs the other way on the server: `coachTeamId()` returns
 * a TEAM and `resolveAthlete()` returns an ATHLETE, and neither can be mistaken
 * for the other.
 *
 * Everything else — timeouts, the ApiError shape, never echoing a request into
 * an error message — is copied deliberately from `lib/api.ts` so the two behave
 * identically where they overlap.
 */
import { ApiError, BASE_URL } from "./api";
import type { CalendarDay } from "../components/YearGrid";
import type {
  DailyPoint,
  Fitness,
  Injury,
  MentalDay,
  PRRecord,
  Patterns,
  PlanDay,
  Predictions,
  RaceHistoryEntry,
  RecoverySnapshot,
  SleepDay,
  ZoneMinutes,
} from "./types";
import { getCoachToken } from "./auth";

/** Matches lib/api: no health endpoint exists, so a wrong base URL just hangs. */
const TIMEOUT_MS = 15_000;

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
};

/**
 * Every coach request. Fails closed without a coach token.
 *
 * The token is never put in an error message, never logged, and never returned
 * to a caller — the only thing that leaves this module is data.
 */
async function coachRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = await getCoachToken();
  if (!token) throw new ApiError(401, "Not signed in as a coach.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch {
    // The thrown value can echo the request, headers included. Never re-use it.
    throw new ApiError(0, `Could not reach the RunGuard server at ${BASE_URL}.`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res
      .json()
      .then((j: unknown) =>
        j && typeof j === "object" && typeof (j as { error?: unknown }).error === "string"
          ? (j as { error: string }).error
          : null
      )
      .catch(() => null);
    throw new ApiError(res.status, detail ?? `Request failed (${res.status}).`);
  }

  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ *
 * Shapes — keyed to website/src/app/api/mobile/coach/*
 * ------------------------------------------------------------------ */

export type SessionSpike = {
  km: number;
  pctAbove: number;
  longestKm: number;
  level: "large" | "moderate";
};

export type RosterAthlete = {
  id: number;
  name: string;
  grade: number | null;
  hue: number;
  tier: string;
  /** Kilometres. Every distance goes through lib/units before it is rendered. */
  rangeKm: number;
  /**
   * Days since the last check-in carrying a self-report, or null when there was
   * none inside `lookbackDays`. Null is "not in the window we looked at", NOT
   * "never" — the UI has to state the bound rather than invent a bigger number.
   */
  daysSinceCheckIn: number | null;
  spike: SessionSpike | null;
  soreness: {
    persistentPart: string | null;
    persistentDays: number;
    persistentPeak: number;
    escalating: boolean;
    todayPart: string | null;
    todayMax: number;
  };
  spark: { date: string; load: number }[];
};

export type TeamPlanDay = {
  id: number;
  date: string;
  type: string;
  distance_m: number | null;
  target_pace: string | null;
  details: string | null;
  why: string | null;
  updated_by: string | null;
};

export type RosterResponse = {
  ok: true;
  team: { id: number; name: string | null; joinCode: string | null };
  range: { key: string; days: number; short: string };
  today: string;
  tomorrow: string;
  plan: { today: TeamPlanDay | null; tomorrow: TeamPlanDay | null };
  summary: {
    spikes: number;
    sore: number;
    quiet: number;
    teamKm: number;
    teamChangePct: number | null;
  };
  /**
   * The overview tab's aggregates, computed on the server.
   *
   * Not derived on the phone: the bands need each athlete's workload ratio and
   * the weekly totals need their full daily series, and `spark` below is
   * deliberately trimmed to 28 points of LOAD — it carries neither distance nor
   * ratio. Asking the server also means this screen and the coach's web
   * dashboard band the same squad with one piece of arithmetic rather than two.
   */
  teamStats: {
    /** `rated` is the denominator, and it is NOT the squad size — see `unrated`. */
    acwr: {
      under: number;
      inZone: number;
      over: number;
      rated: number;
      unrated: number;
    };
    reportedToday: number;
    tiers: { tier: string; n: number }[];
    /** Complete weeks only, oldest first. `week` is the ISO Monday. */
    weeks: { week: string; km: number }[];
    needsLook: number;
  };
  staleAfterDays: number;
  lookbackDays: number;
  athletes: RosterAthlete[];
};

/** Never a bare number. See website/src/lib/readiness.ts. */
export type CoachReadiness = { known: true; value: number } | { known: false };

export type CoachAthlete = {
  ok: true;
  athlete: {
    id: number;
    name: string;
    grade: number | null;
    hue: number;
    events: string[];
  };
  connectedSources: string[];
  readiness: CoachReadiness;
  prePractice: { flag: "clear" | "watch" | "unusual"; reason: string | null };
  fitness: Fitness;
  /** The website's `LoadMetrics`. Only the fields the coach screen reads. */
  load: {
    weekKm: number;
    weekTrimp: number;
    acuteLoad: number;
    chronicLoad: number;
    acwr: number | null;
    spikePct: number | null;
    /** Minutes in each HR zone this week, for the zone bar. */
    weekZones: ZoneMinutes;
  };
  risk: {
    acwr: number | null;
    weekKm: number;
    prevWeekKm: number;
    rampPct: number | null;
    monotony: number | null;
    daysSinceRest: number;
    lastActivity: string | null;
    /** The real shape, so the recovery block can render measured vs absent. */
    recovery: RecoverySnapshot;
    insights: string[];
    hasActivityHistory: boolean;
    selfReport: RosterAthlete["soreness"] & { hasData: boolean; daysSinceReport: number | null };
  };
  patterns: Patterns;
  predictions: Predictions;
  prs: PRRecord[];
  /** 12 weeks of distance, for the weekly-mileage chart. */
  weeks: { week: string; km: number }[];
  /**
   * The athlete's last few questions, VERBATIM and in quotes.
   *
   * Safety-intercepted messages are excluded server-side, in
   * `buildProfile`'s SQL rather than by any caller. An athlete who has just
   * been told to talk to a parent and a doctor does not find that disclosure
   * quoted on their coach's screen.
   */
  chatSummary: string[];
  /** One entry per day of the training year, for `YearGrid`. */
  calendar: CalendarDay[];
  /** Resting HR up AND HRV down together. A pattern, never a diagnosis. */
  illness: boolean;
  /** 30 nights, for the sleep duration chart and the stage breakdown. */
  sleep30: SleepDay[];
  /** 30 days of self-reported energy and motivation. */
  mental30: MentalDay[];
  /** Weekly average pace across the season. */
  paceSeason: { week: string; pace: number | null }[];
  /** PR improvements per event, oldest first — the progression chart. */
  prProgression: Record<string, { date: string; timeS: number }[]>;
  /** Rest days come from here, and are the only thing that makes an
   *  unrecorded day NO RUN rather than a measured zero. */
  plan: { days: PlanDay[] };
  todayCheckin: {
    energy: number | null;
    rpe: number | null;
    motivation: number | null;
    academic_stress: number | null;
  } | null;
  /** A run of consecutive check-ins with falling energy, or null. */
  energyTrend: { days: number; from: number; to: number } | null;
  todaySoreness: { part: string; severity: number }[];
  recentRuns: {
    id: number;
    date: string;
    km: number;
    durationS: number;
    spike: SessionSpike | null;
  }[];
  injuries: Injury[];
  races: {
    upcoming: { id: number; name: string; date: string; daysUntil: number; event: string; predicted: string }[];
    history: RaceHistoryEntry[];
  };
  /**
   * The FULL DailyPoint, not the narrowed `{date, load, km, acwr}` that
   * `/api/mobile/me` sends: `loadSeries` reads `acute` and distinguishes a day
   * the engine never computed from a rest day.
   */
  series: DailyPoint[];
};

/* ------------------------------------------------------------------ *
 * Calls
 * ------------------------------------------------------------------ */

/**
 * Sign in. The one call here that does NOT go through `coachRequest` — it is
 * how the token is obtained, so there is nothing to authenticate with yet.
 *
 * Returns the token to the caller rather than storing it, so the screen decides
 * when the session begins. Storing here would put an unproven credential in the
 * Keychain before anything had confirmed it works.
 */
export async function coachLogin(
  email: string,
  password: string
): Promise<{ token: string; team: string; coach: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/mobile/coach/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, `Could not reach the RunGuard server at ${BASE_URL}.`);
  } finally {
    clearTimeout(timer);
  }

  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; token?: string; team?: string; coach?: string | null; error?: string }
    | null;

  if (!res.ok || !body?.ok || typeof body.token !== "string") {
    throw new ApiError(res.status, body?.error ?? `Sign-in failed (${res.status}).`);
  }
  return { token: body.token, team: body.team ?? "", coach: body.coach ?? null };
}

export function getRoster(rangeKey?: string): Promise<RosterResponse> {
  const q = rangeKey ? `?range=${encodeURIComponent(rangeKey)}` : "";
  return coachRequest<RosterResponse>(`/api/mobile/coach/roster${q}`);
}

export function getCoachAthlete(id: number): Promise<CoachAthlete> {
  return coachRequest<CoachAthlete>(`/api/mobile/coach/athlete/${id}`);
}

/* ------------------------------------------------------------------ *
 * RunGuard 2.0: the team audit. Mirrors `TeamAudit` in
 * website/src/lib/teamAudit.ts. AI-assisted, see DISCLOSURE.md.
 * ------------------------------------------------------------------ */

export type TeamAuditAthlete = {
  id: number;
  name: string;
  hue: number;
  usableDays: number;
  rho: number | null;
  p95: number | null;
  flaggedBy15: number | null;
  p99: number | null;
  injuries: number;
};

export type NullComparison = {
  n: number;
  nEvents: number;
  measure: "AUC";
  real: number;
  realCiLow: number | null;
  realCiHigh: number | null;
  null: number;
  nullCiLow: number;
  nullCiHigh: number;
  nullKind: string;
  nNullDraws: number;
  realBeatsNull: boolean;
  realOutsideNull: boolean;
};

export type TeamAudit = {
  days: number;
  athletes: TeamAuditAthlete[];
  pooled: { days: number; events: number; comparison: NullComparison | null; reason: string | null };
  summary: {
    withPersonalZones: number;
    universalAboveOwn99th: number;
    own95thBelowCaution: number;
    medianRho: number | null;
  };
};

export function getTeamAudit(): Promise<{ ok: true; audit: TeamAudit }> {
  return coachRequest<{ ok: true; audit: TeamAudit }>(`/api/mobile/coach/audit`);
}

/* ------------------------------------------------------------------ *
 * Training calendar
 * ------------------------------------------------------------------ */

export type PlanDayInput = {
  date: string;
  type: string;
  /** METRES, matching the column and the rest of the wire. */
  distanceM: number | null;
  targetPace: string | null;
  details: string | null;
};

export type PlanRange = {
  ok: true;
  from: string;
  to: string;
  /** Keyed by date, because the client draws a grid and asks per cell. */
  days: Record<string, TeamPlanDay>;
};

export function getPlan(from: string, to: string): Promise<PlanRange> {
  return coachRequest<PlanRange>(
    `/api/mobile/coach/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
}

/**
 * Write one day. It REPLACES the generated template for every athlete on the
 * team — see the coach-wins note in engine.ts weeklyPlan — so this is the one
 * call in this module that changes what fourteen people see tomorrow.
 */
export function putPlanDay(day: PlanDayInput): Promise<{ ok: true }> {
  return coachRequest<{ ok: true }>("/api/mobile/coach/plan", {
    method: "POST",
    body: day,
  });
}

/** Clear a day, handing it back to the generator. Absence is the default. */
export function clearPlanDay(date: string): Promise<{ ok: true }> {
  return coachRequest<{ ok: true }>(
    `/api/mobile/coach/plan?date=${encodeURIComponent(date)}`,
    { method: "DELETE" }
  );
}

/* ------------------------------------------------------------------ *
 * Data sources
 * ------------------------------------------------------------------ */

export type SourcesResponse = {
  ok: true;
  team: { id: number; name: string | null; joinCode: string | null };
  athletes: {
    id: number;
    name: string;
    hue: number;
    /**
     * ISO of their most recent activity, or null. Null means "no runs
     * recorded", which is NOT the same as "not connected" — a paired athlete
     * who has not run yet is also null. The screen renders it as an unknown
     * rather than a failure.
     *
     * NOTE: no device token. See the route — a coach's phone does not carry
     * fourteen athletes' credentials.
     */
    lastSync: string | null;
  }[];
};

export function getSources(): Promise<SourcesResponse> {
  return coachRequest<SourcesResponse>("/api/mobile/coach/sources");
}

/* ------------------------------------------------------------------ *
 * The athlete's chat, as their coach may see it
 * ------------------------------------------------------------------ */

export type CoachChatMessage = {
  role: string;
  text: string;
  /**
   * Always false on this wire. The route excludes safety-intercepted messages
   * in SQL, so a `true` here would mean the server changed, not that a message
   * arrived — the client treats it as a bug and refuses to render it.
   */
  safety: boolean;
};

/**
 * READ ONLY, and there is no write counterpart on purpose.
 *
 * A coach typing into an athlete's transcript would be indistinguishable from
 * the athlete having said it — including to the safety interceptor, which
 * would then log it under the athlete's name. `/api/chat` refuses a coach
 * write for that reason; this module simply has no function that could.
 */
export function getCoachChat(id: number): Promise<{ ok: true; history: CoachChatMessage[] }> {
  return coachRequest<{ ok: true; history: CoachChatMessage[] }>(
    `/api/mobile/coach/athlete/${id}/chat`
  );
}

/* ------------------------------------------------------------------ *
 * One run, opened from the roster
 * ------------------------------------------------------------------ */

export type CoachActivity = {
  ok: true;
  athlete: { id: number; name: string; hue: number };
  activity: {
    id: number;
    name: string | null;
    type: string | null;
    startTime: string;
    distanceM: number;
    durationS: number;
    avgPaceSecPerKm: number | null;
    avgHr: number | null;
    maxHr: number | null;
    elevationGainM: number | null;
    calories: number | null;
    cadence: number | null;
    /**
     * The three within-run streams the deployed activity page draws. They were
     * absent from the SQLite schema until now, which is why local dev showed
     * "not recorded" for every run while production drew all three.
     */
    splits: {
      mi: number;
      partial: number;
      seconds: number;
      avg_hr: number | null;
      elev_delta_m: number | null;
    }[];
    hrSeries: { tS: number; bpm: number }[];
    /** METRES. The screen converts; the wire never carries feet. */
    elevSeries: { tS: number; m: number }[];
  };
};

export function getCoachActivity(id: number): Promise<CoachActivity> {
  return coachRequest<CoachActivity>(`/api/mobile/coach/activity/${id}`);
}
