import postgres from "postgres";
import crypto from "crypto";

/**
 * RunGuard data layer — Postgres (Supabase).
 *
 * The app connects over the standard Postgres connection string (DATABASE_URL);
 * that role bypasses RLS, so the server has full read/write while the public
 * anon API stays locked down. All query functions are async.
 *
 * The schema itself is managed in Supabase (see supabase/schema.sql) — the app
 * does not create tables at runtime.
 */

const DATABASE_URL = process.env.DATABASE_URL;

declare global {
  // eslint-disable-next-line no-var
  var __rgsql: ReturnType<typeof postgres> | undefined;
}

function makeClient(): ReturnType<typeof postgres> {
  // Preferred: connect from a raw password (DB_PASSWORD) plus the public
  // host/user/db. This avoids URL-encoding headaches — a password with @, #,
  // :, / etc. just works, no escaping needed.
  const pw = process.env.DB_PASSWORD;
  if (pw && !pw.includes("[YOUR")) {
    return postgres({
      host: process.env.DB_HOST || "aws-0-ca-central-1.pooler.supabase.com",
      port: Number(process.env.DB_PORT || 6543),
      username: process.env.DB_USER || "postgres.lmhxdnqxtecwogmnrdxg",
      password: pw,
      database: process.env.DB_NAME || "postgres",
      prepare: false,
      ssl: "require",
      // Serverless-safe: one connection per instance so many concurrent Vercel
      // lambdas don't exhaust the Supabase pooler.
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  // Fallback: a full DATABASE_URL connection string.
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DB_PASSWORD (or DATABASE_URL) in .env.local");
  const local = /localhost|127\.0\.0\.1|\/tmp|@db\.local/.test(url);
  return postgres(url, {
    // Supabase's transaction pooler (pgbouncer) doesn't support prepared
    // statements, so disable them; harmless on a direct connection too.
    prepare: false,
    ssl: local ? false : "require",
    // Serverless-safe pool sizing (see note above).
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

export function getSql(): ReturnType<typeof postgres> {
  if (!global.__rgsql) {
    global.__rgsql = makeClient();
  }
  return global.__rgsql;
}

function first<T>(rows: readonly T[]): T | undefined {
  return rows.length ? rows[0] : undefined;
}

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

export function makeJoinCode(teamName: string): string {
  const stem = (teamName.replace(/[^a-zA-Z]/g, "").slice(0, 6) || "TEAM").toUpperCase();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
  return `${stem}-${rand}`;
}

export function newDeviceToken(): string {
  return "dt_" + crypto.randomBytes(20).toString("hex");
}

/* ---------------- types ---------------- */

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
};

export type TeamRow = {
  id: number;
  name: string;
  join_code: string;
  coach_name: string | null;
  coach_email: string | null;
  coach_password_hash: string | null;
  auth_user_id: string | null;
};

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
  route: string | null;
};

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

export type InjuryRow = {
  id: number;
  athlete_id: number;
  date: string;
  body_part: string;
  note: string | null;
};

export type GoalRow = { id: number; athlete_id: number; event: string; target: number };

/* ---------------- teams + accounts ---------------- */

export async function createTeam(t: {
  name: string;
  coach_name: string;
  coach_email: string;
  coach_password_hash: string;
  auth_user_id?: string | null;
}): Promise<TeamRow> {
  const sql = getSql();
  let code = makeJoinCode(t.name);
  for (let i = 0; i < 5; i++) {
    const exists = await sql`select 1 from teams where join_code = ${code}`;
    if (!exists.length) break;
    code = makeJoinCode(t.name);
  }
  const rows = await sql`
    insert into teams (name, join_code, coach_name, coach_email, coach_password_hash, auth_user_id)
    values (${t.name}, ${code}, ${t.coach_name}, ${t.coach_email}, ${t.coach_password_hash}, ${t.auth_user_id ?? null})
    returning *`;
  return rows[0] as unknown as TeamRow;
}

export async function getTeamByAuthUser(authUserId: string): Promise<TeamRow | undefined> {
  return first(
    await getSql()`select * from teams where auth_user_id = ${authUserId}`
  ) as TeamRow | undefined;
}

export async function setTeamAuthUser(teamId: number, authUserId: string): Promise<void> {
  await getSql()`update teams set auth_user_id = ${authUserId} where id = ${teamId}`;
}

export async function getTeam(id: number): Promise<TeamRow | undefined> {
  return first(await getSql()`select * from teams where id = ${id}`) as TeamRow | undefined;
}

export async function getTeamByCode(code: string): Promise<TeamRow | undefined> {
  return first(
    await getSql()`select * from teams where lower(join_code) = lower(${code.trim()})`
  ) as TeamRow | undefined;
}

export async function getTeamByCoachEmail(email: string): Promise<TeamRow | undefined> {
  return first(
    await getSql()`select * from teams where lower(coach_email) = lower(${email.trim()})`
  ) as TeamRow | undefined;
}

export async function athletesForTeam(teamId: number): Promise<AthleteRow[]> {
  return (await getSql()`select * from athletes where team_id = ${teamId} order by name`) as unknown as AthleteRow[];
}

export async function getAthleteByEmail(email: string): Promise<AthleteRow | undefined> {
  return first(
    await getSql()`select * from athletes where lower(email) = lower(${email.trim()})`
  ) as AthleteRow | undefined;
}

export async function getAthleteByToken(token: string): Promise<AthleteRow | undefined> {
  return first(
    await getSql()`select * from athletes where device_token = ${token}`
  ) as AthleteRow | undefined;
}

export async function setAthleteTeam(athleteId: number, teamId: number | null): Promise<void> {
  await getSql()`update athletes set team_id = ${teamId} where id = ${athleteId}`;
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
  const sql = getSql();
  const hue = 180 + Math.floor(Math.random() * 160);
  const token = newDeviceToken();
  const rows = await sql`
    insert into athletes (name, email, password_hash, team_id, grade, sex, event_group, avatar_hue, device_token)
    values (${a.name}, ${a.email}, ${a.password_hash}, ${a.team_id}, ${a.grade ?? null}, ${a.sex ?? null}, ${a.event_group ?? "distance"}, ${hue}, ${token})
    returning *`;
  return rows[0] as unknown as AthleteRow;
}

export async function listAthletes(): Promise<AthleteRow[]> {
  return (await getSql()`select * from athletes order by name`) as unknown as AthleteRow[];
}

export async function getAthlete(id: number): Promise<AthleteRow | undefined> {
  return first(await getSql()`select * from athletes where id = ${id}`) as AthleteRow | undefined;
}

export async function activitiesForAthlete(
  athleteId: number,
  sinceIso: string
): Promise<ActivityRow[]> {
  return (await getSql()`
    select * from activities
    where athlete_id = ${athleteId} and start_time >= ${sinceIso}
    order by start_time`) as unknown as ActivityRow[];
}

export async function upcomingRaces(): Promise<RaceRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  return (await getSql()`select * from races where date >= ${today} order by date`) as unknown as RaceRow[];
}

export async function raceResultsForAthlete(athleteId: number): Promise<RaceResultRow[]> {
  return (await getSql()`
    select * from race_results where athlete_id = ${athleteId} order by date`) as unknown as RaceResultRow[];
}

export async function checkinsForAthlete(
  athleteId: number,
  sinceIso: string
): Promise<CheckinRow[]> {
  return (await getSql()`
    select * from checkins
    where athlete_id = ${athleteId} and date >= ${sinceIso.slice(0, 10)}
    order by date`) as unknown as CheckinRow[];
}

export async function injuriesForAthlete(athleteId: number): Promise<InjuryRow[]> {
  return (await getSql()`
    select * from injuries where athlete_id = ${athleteId} order by date desc`) as unknown as InjuryRow[];
}

export async function goalsForAthlete(athleteId: number): Promise<GoalRow[]> {
  return (await getSql()`select * from goals where athlete_id = ${athleteId}`) as unknown as GoalRow[];
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
  await getSql()`
    insert into checkins (athlete_id, date, rpe, soreness_part, soreness_severity, energy, motivation, academic_stress)
    values (${c.athlete_id}, ${c.date}, ${c.rpe ?? null}, ${c.soreness_part ?? null}, ${c.soreness_severity ?? null}, ${c.energy ?? null}, ${c.motivation ?? null}, ${c.academic_stress ?? null})
    on conflict (athlete_id, date) do update set
      rpe = coalesce(excluded.rpe, checkins.rpe),
      soreness_part = coalesce(excluded.soreness_part, checkins.soreness_part),
      soreness_severity = coalesce(excluded.soreness_severity, checkins.soreness_severity),
      energy = coalesce(excluded.energy, checkins.energy),
      motivation = coalesce(excluded.motivation, checkins.motivation),
      academic_stress = coalesce(excluded.academic_stress, checkins.academic_stress)`;
}

export async function metricsForAthlete(
  athleteId: number,
  sinceIso: string
): Promise<MetricRow[]> {
  return (await getSql()`
    select * from health_metrics
    where athlete_id = ${athleteId} and date >= ${sinceIso.slice(0, 10)}
    order by date`) as unknown as MetricRow[];
}

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
  await getSql()`
    insert into health_metrics
      (athlete_id, date, resting_hr, hrv, sleep_hours, vo2max, resp_rate, spo2, wrist_temp, sleep_deep, sleep_rem, sleep_light, sleep_awake, source, updated_at)
    values (${m.athlete_id}, ${m.date}, ${m.resting_hr ?? null}, ${m.hrv ?? null}, ${m.sleep_hours ?? null}, ${m.vo2max ?? null}, ${m.resp_rate ?? null}, ${m.spo2 ?? null}, ${m.wrist_temp ?? null}, ${m.sleep_deep ?? null}, ${m.sleep_rem ?? null}, ${m.sleep_light ?? null}, ${m.sleep_awake ?? null}, ${m.source ?? "healthkit"}, ${new Date().toISOString()})
    on conflict (athlete_id, date) do update set
      resting_hr  = coalesce(excluded.resting_hr, health_metrics.resting_hr),
      hrv         = coalesce(excluded.hrv, health_metrics.hrv),
      sleep_hours = coalesce(excluded.sleep_hours, health_metrics.sleep_hours),
      vo2max      = coalesce(excluded.vo2max, health_metrics.vo2max),
      resp_rate   = coalesce(excluded.resp_rate, health_metrics.resp_rate),
      spo2        = coalesce(excluded.spo2, health_metrics.spo2),
      wrist_temp  = coalesce(excluded.wrist_temp, health_metrics.wrist_temp),
      sleep_deep  = coalesce(excluded.sleep_deep, health_metrics.sleep_deep),
      sleep_rem   = coalesce(excluded.sleep_rem, health_metrics.sleep_rem),
      sleep_light = coalesce(excluded.sleep_light, health_metrics.sleep_light),
      sleep_awake = coalesce(excluded.sleep_awake, health_metrics.sleep_awake),
      updated_at  = ${new Date().toISOString()}`;
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
  route?: string | null;
}): Promise<boolean> {
  const res = await getSql()`
    insert into activities
      (athlete_id, source, external_id, name, type, start_time, distance_m, duration_s, avg_hr, max_hr, elevation_gain_m, calories, cadence, route)
    values (${a.athlete_id}, ${a.source}, ${a.external_id ?? null}, ${a.name ?? null}, ${a.type ?? "Run"}, ${a.start_time}, ${a.distance_m ?? 0}, ${a.duration_s ?? 0}, ${a.avg_hr ?? null}, ${a.max_hr ?? null}, ${a.elevation_gain_m ?? null}, ${a.calories ?? null}, ${a.cadence ?? null}, ${a.route ?? null})
    on conflict (athlete_id, source, external_id) do nothing`;
  return res.count > 0;
}

/** Most recent activities for an athlete, newest first. */
export async function recentActivities(athleteId: number, limit = 60): Promise<ActivityRow[]> {
  return (await getSql()`
    select * from activities
    where athlete_id = ${athleteId}
    order by start_time desc
    limit ${limit}`) as unknown as ActivityRow[];
}

/** A single activity by id (caller must check ownership). */
export async function activityById(id: number): Promise<ActivityRow | undefined> {
  return first(await getSql()`select * from activities where id = ${id}`) as ActivityRow | undefined;
}
