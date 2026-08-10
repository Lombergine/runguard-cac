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

export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(pw, salt, 32).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
  } catch {
    return false;
  }
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
  strava_athlete_id: string | null;
  strava_access_token: string | null;
  strava_refresh_token: string | null;
  strava_expires_at: number | null;
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

export async function getAthleteByEmail(email: string): Promise<AthleteRow | undefined> {
  return one<AthleteRow>("SELECT * FROM athletes WHERE lower(email) = lower(?)", [email.trim()]);
}

export async function getAthleteByToken(token: string): Promise<AthleteRow | undefined> {
  return one<AthleteRow>("SELECT * FROM athletes WHERE device_token = ?", [token]);
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
};

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
  splits: string | null;
  conditions: string | null;
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
  created_by_athlete_id: number;
  team_id: number | null;
}): Promise<RaceRow> {
  const row = await one<RaceRow>(
    `INSERT INTO races (name, date, event, distance_m, location, created_by_athlete_id, team_id)
     VALUES (@name, @date, @event, @distance_m, @location, @created_by_athlete_id, @team_id)
     RETURNING *`,
    { location: null, ...r }
  );
  return row!;
}

export async function updateRace(
  id: number,
  athleteId: number,
  patch: Partial<Pick<RaceRow, "name" | "date" | "event" | "distance_m" | "location">>
): Promise<boolean> {
  const race = await one<RaceRow>("SELECT * FROM races WHERE id = ?", [id]);
  if (!race || race.created_by_athlete_id !== athleteId) return false;
  const fields = Object.keys(patch);
  if (!fields.length) return true;
  const sets = fields.map((f) => `${f} = @${f}`).join(", ");
  await run(`UPDATE races SET ${sets} WHERE id = @id`, { ...patch, id });
  return true;
}

export async function deleteRace(id: number, athleteId: number): Promise<boolean> {
  const race = await one<RaceRow>("SELECT * FROM races WHERE id = ?", [id]);
  if (!race || race.created_by_athlete_id !== athleteId) return false;
  await run("DELETE FROM races WHERE id = ?", [id]);
  return true;
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
