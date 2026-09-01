/**
 * Every query the app makes, written once.
 *
 * Which database these run against is decided by DB_DRIVER and handled entirely
 * in db/driver.ts — nothing here knows or cares whether it is talking to the
 * local SQLite file or Supabase. The SQL is a portable subset (RETURNING and
 * ON CONFLICT behave identically on SQLite 3.53 and Postgres), so there is one
 * copy of each statement rather than two that drift.
 *
 * There is deliberately no exported handle to the underlying driver. Callers get
 * these functions or nothing, which is what keeps the query surface auditable —
 * the same structural argument the safety gates use: enforced by there being no
 * other path, not by convention.
 */
import { localDay } from "./day";
import crypto from "crypto";
import { all, one, run } from "./db/driver";

export { driver, describeTarget, close } from "./db/driver";

/* ---------------- password hashing (scrypt) ---------------- */

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

/** Same shape as a real `salt:hash` (16-byte salt, 32-byte hash, both hex) so a
 *  missing account runs the identical scrypt. The comparison result is thrown
 *  away — this exists only to spend the time. */
const ABSENT_ACCOUNT_HASH = `${"0".repeat(32)}:${"0".repeat(64)}`;

/**
 * Constant-cost in whether the account exists: a null or malformed stored hash
 * still pays a full scrypt before returning false, so login latency no longer
 * answers "is this email registered".
 *
 * That only holds if callers reach here on the miss, so they must pass
 * `row?.password_hash` rather than short-circuiting on the row being absent.
 */
export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  const usable = stored && stored.includes(":") ? stored : null;
  const [salt, hash] = (usable ?? ABSENT_ACCOUNT_HASH).split(":");
  const check = crypto.scryptSync(pw, salt, 32).toString("hex");
  let match: boolean;
  try {
    match = crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
  } catch {
    match = false;
  }
  // No stored hash is never a pass, whatever the throwaway comparison said.
  return usable !== null && match;
}

/* readable join code like "LELAND-7QK4" */
export function makeJoinCode(teamName: string): string {
  const stem = (teamName.replace(/[^a-zA-Z]/g, "").slice(0, 6) || "TEAM").toUpperCase();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
  return `${stem}-${rand}`;
}

export function newDeviceToken(): string {
  return "dt_" + crypto.randomBytes(20).toString("hex");
}

/** SQLite's datetime('now') format, so both drivers write timestamps alike. */
function nowStamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export type AthleteRow = {
  id: number;
  name: string;
  grade: number | null;
  sex: string | null;
  event_group: string | null;
  avatar_hue: number;
  device_token: string | null;
  team_id: number | null;
  email: string | null;
  password_hash: string | null;
  hr_max: number | null;
  hr_max_source: string | null; // 'manual' | 'calibrated'; null = resolve automatically
};

export type TeamRow = {
  id: number;
  name: string;
  join_code: string;
  coach_name: string | null;
  coach_email: string | null;
  coach_password_hash: string | null;
};

/* ---------------- teams + accounts ---------------- */

export async function createTeam(t: {
  name: string;
  coach_name: string;
  coach_email: string;
  coach_password_hash: string;
}): Promise<TeamRow> {
  let code = makeJoinCode(t.name);
  // guarantee uniqueness
  for (let i = 0; i < 5; i++) {
    const exists = await one("SELECT 1 AS hit FROM teams WHERE join_code = ?", [code]);
    if (!exists) break;
    code = makeJoinCode(t.name);
  }
  const row = await one<TeamRow>(
    `INSERT INTO teams (name, join_code, coach_name, coach_email, coach_password_hash)
     VALUES (@name, @join_code, @coach_name, @coach_email, @coach_password_hash)
     RETURNING *`,
    { ...t, join_code: code }
  );
  return row!;
}

export async function getTeam(id: number): Promise<TeamRow | undefined> {
  return one<TeamRow>("SELECT * FROM teams WHERE id = ?", [id]);
}

// lower() rather than COLLATE NOCASE: NOCASE is SQLite-only, and both engines
// fold ASCII identically, which is all join codes and emails contain.
export async function getTeamByCode(code: string): Promise<TeamRow | undefined> {
  return one<TeamRow>("SELECT * FROM teams WHERE lower(join_code) = lower(?)", [code.trim()]);
}

export async function getTeamByCoachEmail(email: string): Promise<TeamRow | undefined> {
  return one<TeamRow>("SELECT * FROM teams WHERE lower(coach_email) = lower(?)", [email.trim()]);
}

export async function athletesForTeam(teamId: number): Promise<AthleteRow[]> {
  return all<AthleteRow>("SELECT * FROM athletes WHERE team_id = ? ORDER BY name", [teamId]);
}

/**
 * Most recent activity per athlete on a team, as `athlete_id -> start_time`.
 *
 * The Data sources page needs one fact per athlete — "is anything actually
 * arriving?" — and used to answer it from a stored link column, which was a
 * link state, not a sync state: an athlete could be linked and sending
 * nothing. Reading the real last activity is one grouped query for the whole
 * roster rather than N per-athlete lookups.
 */
export async function lastSyncForTeam(teamId: number): Promise<Map<number, string>> {
  const rows = await all<{ athlete_id: number; last_at: string | null }>(
    `SELECT a.athlete_id AS athlete_id, MAX(a.start_time) AS last_at
       FROM activities a
       JOIN athletes t ON t.id = a.athlete_id
      WHERE t.team_id = ?
      GROUP BY a.athlete_id`,
    [teamId]
  );
  const out = new Map<number, string>();
  for (const r of rows) if (r.last_at) out.set(r.athlete_id, r.last_at);
  return out;
}

/**
 * Athletes whose phone has actually delivered HealthKit data since `cutoff`,
 * mapped to when it last arrived.
 *
 * NOT the same question as `lastSyncForTeam`, which reads MAX(start_time) — the
 * date of the most recent *run*. A team that imported a year of history through
 * the coach's ZIP upload has recent runs and has never synced. This reads
 * `created_at`, the moment the row was written, which is the only column that
 * records ingest rather than exercise.
 *
 * `source = 'healthkit'` alone is not enough either: the seeded roster carries
 * that value on every row. Recency is what separates them — seed rows share one
 * frozen `created_at` and age out of the window, while a phone that is really
 * syncing pushes its athlete's timestamp forward on every sync.
 */
export async function healthkitIngestSince(cutoff: string): Promise<Map<number, string>> {
  const rows = await all<{ athlete_id: number; last_at: string | null }>(
    `SELECT athlete_id, MAX(created_at) AS last_at
       FROM activities
      WHERE source = 'healthkit' AND created_at > ?
      GROUP BY athlete_id`,
    [cutoff]
  );
  const out = new Map<number, string>();
  for (const r of rows) if (r.last_at) out.set(r.athlete_id, r.last_at);
  return out;
}

export async function getAthleteByEmail(email: string): Promise<AthleteRow | undefined> {
  return one<AthleteRow>("SELECT * FROM athletes WHERE lower(email) = lower(?)", [email.trim()]);
}

export async function setAthleteTeam(athleteId: number, teamId: number | null): Promise<void> {
  await run("UPDATE athletes SET team_id = ? WHERE id = ?", [teamId, athleteId]);
}

export async function createAthleteAccount(a: {
  name: string;
  email: string;
  password_hash: string;
  team_id: number | null;
  grade?: number | null;
  sex?: string | null;
  event_group?: string | null;
}): Promise<AthleteRow> {
  const hue = 180 + Math.floor(Math.random() * 160);
  const token = newDeviceToken();
  const row = await one<AthleteRow>(
    `INSERT INTO athletes (name, email, password_hash, team_id, grade, sex, event_group, avatar_hue, device_token)
     VALUES (@name, @email, @password_hash, @team_id, @grade, @sex, @event_group, @avatar_hue, @device_token)
     RETURNING *`,
    {
      grade: null,
      sex: null,
      event_group: "distance",
      ...a,
      avatar_hue: hue,
      device_token: token,
    }
  );
  return row!;
}

export type ActivityRow = {
  id: number;
  athlete_id: number;
  source: string;
  external_id: string | null;
  name: string | null;
  type: string;
  start_time: string;
  distance_m: number;
  duration_s: number;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain_m: number | null;
  calories: number | null;
  cadence: number | null;
  /** Encoded polyline for the activity detail map. Null for most sources. */
  route: string | null;
  /**
   * Per-run detail, as JSON text. Null means the source never recorded it —
   * which today is every real run, because the iPhone app does not yet pull the
   * HealthKit sample series. The UI must render "not recorded" for null rather
   * than deriving a plausible-looking number: a coach can act on a mile split.
   */
  splits: string | null;
  hr_series: string | null;
  elev_series: string | null;
};

export type Split = {
  mi: number;
  /** 1 for a full mile, <1 for the final partial one. */
  partial: number;
  seconds: number;
  avg_hr: number | null;
  elev_delta_m: number | null;
};
export type SeriesSample = { t_s: number; bpm?: number; m?: number };

/** Parse one of the JSON stream columns. Bad or absent data yields [], never a throw. */
export function parseStream<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export async function listAthletes(): Promise<AthleteRow[]> {
  return all<AthleteRow>("SELECT * FROM athletes ORDER BY name");
}

export async function getAthlete(id: number): Promise<AthleteRow | undefined> {
  return one<AthleteRow>("SELECT * FROM athletes WHERE id = ?", [id]);
}

export async function activitiesForAthlete(
  athleteId: number,
  sinceIso: string
): Promise<ActivityRow[]> {
  return all<ActivityRow>(
    "SELECT * FROM activities WHERE athlete_id = ? AND start_time >= ? ORDER BY start_time",
    [athleteId, sinceIso]
  );
}

export async function getActivityById(
  id: number
): Promise<ActivityRow | undefined> {
  return one<ActivityRow>("SELECT * FROM activities WHERE id = ?", [id]);
}

export type MetricRow = {
  id: number;
  athlete_id: number;
  date: string;
  resting_hr: number | null;
  hrv: number | null;
  sleep_hours: number | null;
  vo2max: number | null;
  resp_rate: number | null;
  spo2: number | null;
  wrist_temp: number | null;
  sleep_deep: number | null;
  sleep_rem: number | null;
  sleep_light: number | null;
  sleep_awake: number | null;
  source: string;
};

export type RaceRow = {
  id: number;
  name: string;
  date: string;
  event: string;
  distance_m: number;
  location: string | null;
  created_by_athlete_id: number | null; // null = coach/seed-created
  team_id: number | null;
  /** 'HH:MM' local gun time. Null = not recorded, never "midnight". */
  start_time: string | null;
  /** 'Track' | 'Cross country' | 'Road' | 'Trail' */
  course_type: string | null;
  /** 'A' | 'B' | 'C' — how much this one matters, which drives taper advice. */
  priority: string | null;
  notes: string | null;
};

export type RaceResultRow = {
  id: number;
  athlete_id: number;
  race_id: number | null;
  event: string;
  date: string;
  time_s: number;
  place: number | null;
  feel: string | null;
  /** JSON array of split seconds, e.g. "[74,76,79]". Null = none reported. */
  splits: string | null;
  conditions: string | null;
  notes: string | null;
};

export type CheckinRow = {
  id: number;
  athlete_id: number;
  date: string;
  rpe: number | null;
  soreness_part: string | null;
  soreness_severity: number | null;
  energy: number | null;
  motivation: number | null;
  academic_stress: number | null;
};

export type CheckinSorenessRow = {
  id: number;
  checkin_id: number;
  athlete_id: number;
  date: string;
  body_part: string;
  severity: number;
};

export type InjuryRow = {
  id: number;
  athlete_id: number;
  date: string;
  body_part: string;
  note: string | null;
  resolved_at: string | null;
};

export type GoalRow = { id: number; athlete_id: number; event: string; target: number };

export async function upcomingRaces(scope: {
  athleteId: number;
  teamId: number | null;
}): Promise<RaceRow[]> {
  const today = localDay();
  return all<RaceRow>(
    `SELECT * FROM races WHERE date >= ?
       AND (created_by_athlete_id = ?
            OR (created_by_athlete_id IS NULL AND team_id IS NOT NULL AND team_id = ?))
     ORDER BY date`,
    [today, scope.athleteId, scope.teamId]
  );
}

export async function createRace(r: {
  name: string;
  date: string;
  event: string;
  distance_m: number;
  location?: string | null;
  start_time?: string | null;
  course_type?: string | null;
  priority?: string | null;
  notes?: string | null;
  /** null = a team race (coach- or seed-created), which everyone on the team sees. */
  created_by_athlete_id: number | null;
  team_id: number | null;
}): Promise<RaceRow> {
  const row = await one<RaceRow>(
    `INSERT INTO races
       (name, date, event, distance_m, location, start_time, course_type, priority, notes,
        created_by_athlete_id, team_id)
     VALUES
       (@name, @date, @event, @distance_m, @location, @start_time, @course_type, @priority, @notes,
        @created_by_athlete_id, @team_id)
     RETURNING *`,
    // Defaults first so a caller that omits an optional field writes NULL rather
    // than `undefined`, which the SQLite driver rejects as a bound parameter.
    { location: null, start_time: null, course_type: null, priority: null, notes: null, ...r }
  );
  return row!;
}

const RACE_PATCH_COLUMNS: string[] = [
  "name",
  "date",
  "event",
  "distance_m",
  "location",
  "start_time",
  "course_type",
  "priority",
  "notes",
];

/**
 * Who is allowed to change a race.
 *
 * A race is either personal — one athlete added it, `created_by_athlete_id` is
 * their id — or a team race the coach or the seeder added, where the creator is
 * NULL and `team_id` is set. Both edit paths used to compare
 * `created_by_athlete_id !== athleteId` and nothing else, which meant a team
 * race had no owner at all: the coach who created it could not edit or remove
 * it, and neither could anyone else. The only way to correct a mistyped team
 * race was a database write.
 *
 * A coach may act on their own team's races. They may NOT touch a race an
 * athlete added for themselves — that is the athlete's own calendar, and
 * deleting it is not a coaching decision.
 */
export type RaceActor = { athleteId: number; teamId: number | null; isCoach: boolean };

function mayEditRace(race: RaceRow, actor: RaceActor): boolean {
  if (race.created_by_athlete_id !== null) return race.created_by_athlete_id === actor.athleteId;
  return actor.isCoach && actor.teamId !== null && race.team_id === actor.teamId;
}

export async function updateRace(
  id: number,
  actor: RaceActor,
  patch: Partial<
    Pick<
      RaceRow,
      | "name"
      | "date"
      | "event"
      | "distance_m"
      | "location"
      | "start_time"
      | "course_type"
      | "priority"
      | "notes"
    >
  >
): Promise<boolean> {
  const race = await one<RaceRow>("SELECT * FROM races WHERE id = ?", [id]);
  if (!race || !mayEditRace(race, actor)) return false;
  const fields = Object.keys(patch);
  if (!fields.length) return true;
  // Column names cannot be bound, so they are interpolated — which means the only
  // thing standing between a request body and the SQL text is whatever the caller
  // built `patch` from. Today that is a fixed list of literals in the PATCH route,
  // but that is a convention, and a second caller that assigned straight from
  // parsed JSON would be writing SQL from the network. Throwing on an unknown key
  // (rather than dropping it, which would report success for an edit that never
  // happened) makes it structural instead.
  const bad = fields.filter((f) => !RACE_PATCH_COLUMNS.includes(f));
  if (bad.length) throw new Error(`updateRace: not an editable race column: ${bad.join(", ")}`);
  const sets = fields.map((f) => `${f} = @${f}`).join(", ");
  await run(`UPDATE races SET ${sets} WHERE id = @id`, { ...patch, id });
  return true;
}

export async function deleteRace(id: number, actor: RaceActor): Promise<boolean> {
  const race = await one<RaceRow>("SELECT * FROM races WHERE id = ?", [id]);
  if (!race || !mayEditRace(race, actor)) return false;
  await run("DELETE FROM races WHERE id = ?", [id]);
  return true;
}

/* ---------------- the coach's training calendar ---------------- */

export type TeamPlanDayRow = {
  id: number;
  team_id: number;
  date: string;
  type: string;
  distance_m: number | null;
  target_pace: string | null;
  details: string | null;
  why: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

/**
 * The coach-written days in a date window, inclusive both ends.
 *
 * Returned as a Map keyed by date because every caller wants "is there a coach
 * day for THIS date" rather than a list — the plan builder walks seven dates and
 * the calendar editor walks twenty-eight, and both would otherwise do a linear
 * scan per day.
 */
export async function teamPlanDays(
  teamId: number,
  fromIso: string,
  toIso: string
): Promise<Map<string, TeamPlanDayRow>> {
  const rows = await all<TeamPlanDayRow>(
    "SELECT * FROM team_plan_days WHERE team_id = ? AND date >= ? AND date <= ? ORDER BY date",
    [teamId, fromIso, toIso]
  );
  return new Map(rows.map((r) => [r.date, r]));
}

/**
 * Write one day of the calendar.
 *
 * ON CONFLICT rather than a read-then-branch: two coaches editing the same day
 * from two devices is a realistic thing at a meet, and the UNIQUE constraint
 * makes last-write-wins the outcome instead of a duplicate-key 500. The clause
 * behaves identically on SQLite 3.53 and Postgres, which is why there is one
 * statement here rather than two.
 */
export async function upsertTeamPlanDay(d: {
  team_id: number;
  date: string;
  type: string;
  distance_m: number | null;
  target_pace: string | null;
  details: string | null;
  why: string | null;
  updated_by: string | null;
}): Promise<void> {
  await run(
    `INSERT INTO team_plan_days
       (team_id, date, type, distance_m, target_pace, details, why, updated_at, updated_by)
     VALUES
       (@team_id, @date, @type, @distance_m, @target_pace, @details, @why, @updated_at, @updated_by)
     ON CONFLICT (team_id, date) DO UPDATE SET
       type        = excluded.type,
       distance_m  = excluded.distance_m,
       target_pace = excluded.target_pace,
       details     = excluded.details,
       why         = excluded.why,
       updated_at  = excluded.updated_at,
       updated_by  = excluded.updated_by`,
    { ...d, updated_at: nowStamp() }
  );
}

/**
 * Clear a day, returning it to the generated template.
 *
 * Team-scoped in the statement itself, not by the caller checking first: a
 * `DELETE ... WHERE id = ?` here would let one team's coach delete another
 * team's day by guessing a date.
 */
export async function deleteTeamPlanDay(teamId: number, date: string): Promise<void> {
  await run("DELETE FROM team_plan_days WHERE team_id = ? AND date = ?", [teamId, date]);
}

export async function raceResultsForAthlete(athleteId: number): Promise<RaceResultRow[]> {
  return all<RaceResultRow>(
    "SELECT * FROM race_results WHERE athlete_id = ? ORDER BY date",
    [athleteId]
  );
}

export async function checkinsForAthlete(
  athleteId: number,
  sinceIso: string
): Promise<CheckinRow[]> {
  return all<CheckinRow>(
    "SELECT * FROM checkins WHERE athlete_id = ? AND date >= ? ORDER BY date",
    [athleteId, sinceIso.slice(0, 10)]
  );
}

export async function injuriesForAthlete(athleteId: number): Promise<InjuryRow[]> {
  return all<InjuryRow>(
    "SELECT * FROM injuries WHERE athlete_id = ? ORDER BY date DESC",
    [athleteId]
  );
}

export async function goalsForAthlete(athleteId: number): Promise<GoalRow[]> {
  return all<GoalRow>("SELECT * FROM goals WHERE athlete_id = ?", [athleteId]);
}

export async function upsertCheckin(c: {
  athlete_id: number;
  date: string;
  rpe?: number | null;
  soreness_part?: string | null;
  soreness_severity?: number | null;
  energy?: number | null;
  motivation?: number | null;
  academic_stress?: number | null;
}): Promise<void> {
  await run(
    `INSERT INTO checkins (athlete_id, date, rpe, soreness_part, soreness_severity, energy, motivation, academic_stress)
     VALUES (@athlete_id, @date, @rpe, @soreness_part, @soreness_severity, @energy, @motivation, @academic_stress)
     ON CONFLICT(athlete_id, date) DO UPDATE SET
       rpe = COALESCE(excluded.rpe, checkins.rpe),
       soreness_part = COALESCE(excluded.soreness_part, checkins.soreness_part),
       soreness_severity = COALESCE(excluded.soreness_severity, checkins.soreness_severity),
       energy = COALESCE(excluded.energy, checkins.energy),
       motivation = COALESCE(excluded.motivation, checkins.motivation),
       academic_stress = COALESCE(excluded.academic_stress, checkins.academic_stress)`,
    {
      rpe: null,
      soreness_part: null,
      soreness_severity: null,
      energy: null,
      motivation: null,
      academic_stress: null,
      ...c,
    }
  );
}

export async function sorenessForCheckin(
  athleteId: number,
  date: string
): Promise<CheckinSorenessRow[]> {
  return all<CheckinSorenessRow>(
    "SELECT * FROM checkin_soreness WHERE athlete_id = ? AND date = ? ORDER BY severity DESC",
    [athleteId, date]
  );
}

export async function upsertCheckinSoreness(s: {
  athlete_id: number;
  date: string;
  body_part: string;
  severity: number;
}): Promise<void> {
  await upsertCheckin({ athlete_id: s.athlete_id, date: s.date });
  const checkin = await one<{ id: number }>(
    "SELECT id FROM checkins WHERE athlete_id = ? AND date = ?",
    [s.athlete_id, s.date]
  );
  await run(
    `INSERT INTO checkin_soreness (checkin_id, athlete_id, date, body_part, severity)
     VALUES (@checkin_id, @athlete_id, @date, @body_part, @severity)
     ON CONFLICT(athlete_id, date, body_part) DO UPDATE SET
       severity = excluded.severity, checkin_id = excluded.checkin_id`,
    { ...s, checkin_id: checkin!.id }
  );
}

export async function clearCheckinSoreness(s: {
  athlete_id: number;
  date: string;
  body_part: string;
}): Promise<void> {
  await run(
    "DELETE FROM checkin_soreness WHERE athlete_id = ? AND date = ? AND body_part = ?",
    [s.athlete_id, s.date, s.body_part]
  );
}

export async function metricsForAthlete(
  athleteId: number,
  sinceIso: string
): Promise<MetricRow[]> {
  const sinceDay = sinceIso.slice(0, 10);
  return all<MetricRow>(
    "SELECT * FROM health_metrics WHERE athlete_id = ? AND date >= ? ORDER BY date",
    [athleteId, sinceDay]
  );
}

/** Insert or merge a day's recovery metrics — only overwrites fields that arrive non-null. */
export async function upsertMetric(m: {
  athlete_id: number;
  date: string;
  resting_hr?: number | null;
  hrv?: number | null;
  sleep_hours?: number | null;
  vo2max?: number | null;
  resp_rate?: number | null;
  spo2?: number | null;
  wrist_temp?: number | null;
  sleep_deep?: number | null;
  sleep_rem?: number | null;
  sleep_light?: number | null;
  sleep_awake?: number | null;
  source?: string;
}): Promise<void> {
  await run(
    `INSERT INTO health_metrics
      (athlete_id, date, resting_hr, hrv, sleep_hours, vo2max, resp_rate, spo2, wrist_temp, sleep_deep, sleep_rem, sleep_light, sleep_awake, source, updated_at)
     VALUES (@athlete_id, @date, @resting_hr, @hrv, @sleep_hours, @vo2max, @resp_rate, @spo2, @wrist_temp, @sleep_deep, @sleep_rem, @sleep_light, @sleep_awake, @source, @updated_at)
     ON CONFLICT(athlete_id, date) DO UPDATE SET
       resting_hr  = COALESCE(excluded.resting_hr, health_metrics.resting_hr),
       hrv         = COALESCE(excluded.hrv, health_metrics.hrv),
       sleep_hours = COALESCE(excluded.sleep_hours, health_metrics.sleep_hours),
       vo2max      = COALESCE(excluded.vo2max, health_metrics.vo2max),
       resp_rate   = COALESCE(excluded.resp_rate, health_metrics.resp_rate),
       spo2        = COALESCE(excluded.spo2, health_metrics.spo2),
       wrist_temp  = COALESCE(excluded.wrist_temp, health_metrics.wrist_temp),
       sleep_deep  = COALESCE(excluded.sleep_deep, health_metrics.sleep_deep),
       sleep_rem   = COALESCE(excluded.sleep_rem, health_metrics.sleep_rem),
       sleep_light = COALESCE(excluded.sleep_light, health_metrics.sleep_light),
       sleep_awake = COALESCE(excluded.sleep_awake, health_metrics.sleep_awake),
       updated_at  = excluded.updated_at`,
    {
      resting_hr: null,
      hrv: null,
      sleep_hours: null,
      vo2max: null,
      resp_rate: null,
      spo2: null,
      wrist_temp: null,
      sleep_deep: null,
      sleep_rem: null,
      sleep_light: null,
      sleep_awake: null,
      source: "healthkit",
      ...m,
      updated_at: nowStamp(),
    }
  );
}

export async function insertActivity(a: {
  athlete_id: number;
  source: string;
  external_id?: string | null;
  name?: string | null;
  type?: string;
  start_time: string;
  distance_m?: number;
  duration_s?: number;
  avg_hr?: number | null;
  max_hr?: number | null;
  elevation_gain_m?: number | null;
  calories?: number | null;
  cadence?: number | null;
}): Promise<boolean> {
  // ON CONFLICT DO NOTHING rather than INSERT OR IGNORE: same effect against the
  // UNIQUE(athlete_id, source, external_id) constraint, and portable.
  const changes = await run(
    `INSERT INTO activities
     (athlete_id, source, external_id, name, type, start_time, distance_m, duration_s, avg_hr, max_hr, elevation_gain_m, calories, cadence)
     VALUES (@athlete_id, @source, @external_id, @name, @type, @start_time, @distance_m, @duration_s, @avg_hr, @max_hr, @elevation_gain_m, @calories, @cadence)
     ON CONFLICT DO NOTHING`,
    {
      external_id: null,
      name: null,
      type: "Run",
      distance_m: 0,
      duration_s: 0,
      avg_hr: null,
      max_hr: null,
      elevation_gain_m: null,
      calories: null,
      cadence: null,
      ...a,
    }
  );
  return changes > 0;
}

/** Every soreness report in a window. `checkin_soreness` has always stored the
 *  full dated history and is indexed for it, but until now only the single
 *  current day was ever read back. */
export async function sorenessHistory(
  athleteId: number,
  sinceIso: string
): Promise<CheckinSorenessRow[]> {
  return all<CheckinSorenessRow>(
    "SELECT * FROM checkin_soreness WHERE athlete_id = ? AND date >= ? ORDER BY date ASC, severity DESC",
    [athleteId, sinceIso]
  );
}

/** Set (or clear) an athlete's max heart rate. Passing null for `hrMax` clears
 *  the stored value so it falls back to automatic resolution. */
export async function setAthleteHrMax(
  athleteId: number,
  hrMax: number | null,
  source: "manual" | "calibrated" | null
): Promise<void> {
  await run("UPDATE athletes SET hr_max = ?, hr_max_source = ? WHERE id = ?", [
    hrMax,
    hrMax === null ? null : source,
    athleteId,
  ]);
}

/* ---------------- daily snapshots ---------------- */

export type RiskSnapshotRow = {
  id: number;
  athlete_id: number;
  date: string;
  acwr: number | null;
  ramp_pct: number | null;
  monotony: number | null;
  days_since_rest: number | null;
  week_km: number | null;
  rhr_delta: number | null;
  hrv_delta_pct: number | null;
  sleep_avg: number | null;
  soreness_max: number | null;
  soreness_days_7: number | null;
  energy: number | null;
  readiness: number | null;
  spike_pct_above: number | null;
  spike_km: number | null;
  hr_max: number | null;
  hr_max_source: string | null;
  legacy_risk_score: number | null;
  created_at: string;
};

/** Idempotent per (athlete, day) so backfills and re-runs converge. */
export async function upsertRiskSnapshot(
  s: Omit<RiskSnapshotRow, "id" | "created_at">
): Promise<void> {
  await run(
    `INSERT INTO risk_snapshots
       (athlete_id, date, acwr, ramp_pct, monotony, days_since_rest, week_km,
        rhr_delta, hrv_delta_pct, sleep_avg, soreness_max, soreness_days_7,
        energy, readiness, spike_pct_above, spike_km, hr_max, hr_max_source,
        legacy_risk_score)
     VALUES
       (@athlete_id, @date, @acwr, @ramp_pct, @monotony, @days_since_rest, @week_km,
        @rhr_delta, @hrv_delta_pct, @sleep_avg, @soreness_max, @soreness_days_7,
        @energy, @readiness, @spike_pct_above, @spike_km, @hr_max, @hr_max_source,
        @legacy_risk_score)
     ON CONFLICT(athlete_id, date) DO UPDATE SET
       acwr = excluded.acwr, ramp_pct = excluded.ramp_pct,
       monotony = excluded.monotony, days_since_rest = excluded.days_since_rest,
       week_km = excluded.week_km, rhr_delta = excluded.rhr_delta,
       hrv_delta_pct = excluded.hrv_delta_pct, sleep_avg = excluded.sleep_avg,
       soreness_max = excluded.soreness_max, soreness_days_7 = excluded.soreness_days_7,
       energy = excluded.energy, readiness = excluded.readiness,
       spike_pct_above = excluded.spike_pct_above, spike_km = excluded.spike_km,
       hr_max = excluded.hr_max, hr_max_source = excluded.hr_max_source,
       legacy_risk_score = excluded.legacy_risk_score`,
    s as unknown as Record<string, unknown>
  );
}

export async function allRiskSnapshots(): Promise<RiskSnapshotRow[]> {
  return all<RiskSnapshotRow>(
    "SELECT * FROM risk_snapshots ORDER BY athlete_id ASC, date ASC"
  );
}
