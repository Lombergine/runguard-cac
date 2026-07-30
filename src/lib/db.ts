import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "milemarker.db");

declare global {
  // eslint-disable-next-line no-var
  var __mmdb: Database.Database | undefined;
}

function init(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      join_code TEXT NOT NULL UNIQUE,     -- athletes join with this
      coach_name TEXT,
      coach_email TEXT UNIQUE,
      coach_password_hash TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS athletes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      grade INTEGER,
      sex TEXT,
      event_group TEXT,               -- 'distance' | 'mid' | 'sprint'
      avatar_hue INTEGER DEFAULT 210,
      device_token TEXT UNIQUE,       -- iOS app auth token
      strava_athlete_id TEXT,
      strava_access_token TEXT,
      strava_refresh_token TEXT,
      strava_expires_at INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      source TEXT NOT NULL,           -- 'seed' | 'strava' | 'healthkit' | 'apple_export'
      external_id TEXT,
      name TEXT,
      type TEXT DEFAULT 'Run',
      start_time TEXT NOT NULL,       -- ISO datetime
      distance_m REAL DEFAULT 0,
      duration_s REAL DEFAULT 0,
      avg_hr REAL,
      max_hr REAL,
      elevation_gain_m REAL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(athlete_id, source, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_activities_athlete_time
      ON activities(athlete_id, start_time);

    CREATE TABLE IF NOT EXISTS waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      role TEXT,                      -- 'coach' | 'athlete' | 'parent' | other
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS races (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,             -- YYYY-MM-DD
      event TEXT NOT NULL,            -- '800m' | 'Mile' | '5K' | 'XC 5K'
      distance_m REAL NOT NULL,
      location TEXT
    );

    CREATE TABLE IF NOT EXISTS race_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      race_id INTEGER REFERENCES races(id),
      event TEXT NOT NULL,
      date TEXT NOT NULL,
      time_s REAL NOT NULL,
      place INTEGER,
      feel TEXT,                      -- 'great' | 'ok' | 'rough'
      splits TEXT,                    -- JSON array of split seconds
      conditions TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      date TEXT NOT NULL,             -- YYYY-MM-DD
      rpe REAL,                       -- 1-10 session effort
      soreness_part TEXT,
      soreness_severity REAL,         -- 1-10
      energy REAL,                    -- 1-10
      motivation REAL,                -- 1-10
      academic_stress INTEGER,        -- 0/1
      UNIQUE(athlete_id, date)
    );

    CREATE TABLE IF NOT EXISTS checkin_soreness (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checkin_id INTEGER NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
      athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      date TEXT NOT NULL,             -- YYYY-MM-DD
      body_part TEXT NOT NULL,
      severity REAL NOT NULL,         -- 0-10
      UNIQUE(athlete_id, date, body_part)
    );
    CREATE INDEX IF NOT EXISTS idx_checkin_soreness_athlete_date
      ON checkin_soreness(athlete_id, date);

    CREATE TABLE IF NOT EXISTS injuries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      body_part TEXT NOT NULL,
      note TEXT,
      resolved_at TEXT              -- YYYY-MM-DD once healed; null = still active
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      event TEXT NOT NULL,            -- '800m' | 'Mile' | '5K' | 'XC 5K' | 'weekly_km'
      target REAL NOT NULL,           -- seconds for events, km for weekly_km
      UNIQUE(athlete_id, event)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      role TEXT NOT NULL,             -- 'user' | 'assistant'
      text TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workout_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      date TEXT NOT NULL,             -- YYYY-MM-DD of the planned workout
      status TEXT NOT NULL,           -- 'done' | 'modified' | 'skipped'
      UNIQUE(athlete_id, date)
    );

    CREATE TABLE IF NOT EXISTS health_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      date TEXT NOT NULL,             -- YYYY-MM-DD (local day)
      resting_hr REAL,                -- bpm
      hrv REAL,                       -- ms (SDNN)
      sleep_hours REAL,               -- hours asleep
      vo2max REAL,                    -- ml/kg/min
      resp_rate REAL,                 -- breaths/min (optional)
      source TEXT DEFAULT 'healthkit',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(athlete_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_metrics_athlete_date
      ON health_metrics(athlete_id, date);
  `);
  // additive migrations for columns introduced after first release
  const addColumn = (table: string, ddl: string) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    } catch {
      // column already exists
    }
  };
  addColumn("health_metrics", "spo2 REAL");            // %
  addColumn("health_metrics", "wrist_temp REAL");      // deviation °C
  addColumn("health_metrics", "sleep_deep REAL");      // hours
  addColumn("health_metrics", "sleep_rem REAL");
  addColumn("health_metrics", "sleep_light REAL");
  addColumn("health_metrics", "sleep_awake REAL");
  addColumn("activities", "calories REAL");            // active kcal
  addColumn("activities", "cadence REAL");             // steps/min
  // real-account columns on athletes
  addColumn("athletes", "team_id INTEGER");
  addColumn("athletes", "email TEXT");
  addColumn("athletes", "password_hash TEXT");
  addColumn("injuries", "resolved_at TEXT");           // null = still active
  addColumn("races", "created_by_athlete_id INTEGER REFERENCES athletes(id)"); // null = coach/seed-created
  addColumn("races", "team_id INTEGER REFERENCES teams(id)");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_races_created_by ON races(created_by_athlete_id);
    CREATE INDEX IF NOT EXISTS idx_races_team ON races(team_id);
  `);
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_athletes_email ON athletes(email) WHERE email IS NOT NULL");
  } catch {
    /* index exists */
  }
  return db;
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

/* readable join code like "LELAND-7QK4" */
export function makeJoinCode(teamName: string): string {
  const stem = (teamName.replace(/[^a-zA-Z]/g, "").slice(0, 6) || "TEAM").toUpperCase();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
  return `${stem}-${rand}`;
}

export function newDeviceToken(): string {
  return "dt_" + crypto.randomBytes(20).toString("hex");
}

export function getDb(): Database.Database {
  if (!global.__mmdb) global.__mmdb = init();
  return global.__mmdb;
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

export function createTeam(t: {
  name: string;
  coach_name: string;
  coach_email: string;
  coach_password_hash: string;
}): TeamRow {
  const db = getDb();
  let code = makeJoinCode(t.name);
  // guarantee uniqueness
  for (let i = 0; i < 5; i++) {
    const exists = db.prepare("SELECT 1 FROM teams WHERE join_code = ?").get(code);
    if (!exists) break;
    code = makeJoinCode(t.name);
  }
  const info = db
    .prepare(
      `INSERT INTO teams (name, join_code, coach_name, coach_email, coach_password_hash)
       VALUES (@name, @join_code, @coach_name, @coach_email, @coach_password_hash)`
    )
    .run({ ...t, join_code: code });
  return getTeam(Number(info.lastInsertRowid))!;
}

export function getTeam(id: number): TeamRow | undefined {
  return getDb().prepare("SELECT * FROM teams WHERE id = ?").get(id) as TeamRow | undefined;
}

export function getTeamByCode(code: string): TeamRow | undefined {
  return getDb()
    .prepare("SELECT * FROM teams WHERE join_code = ? COLLATE NOCASE")
    .get(code.trim()) as TeamRow | undefined;
}

export function getTeamByCoachEmail(email: string): TeamRow | undefined {
  return getDb()
    .prepare("SELECT * FROM teams WHERE coach_email = ? COLLATE NOCASE")
    .get(email.trim()) as TeamRow | undefined;
}

export function athletesForTeam(teamId: number): AthleteRow[] {
  return getDb()
    .prepare("SELECT * FROM athletes WHERE team_id = ? ORDER BY name")
    .all(teamId) as AthleteRow[];
}

export function getAthleteByEmail(email: string): AthleteRow | undefined {
  return getDb()
    .prepare("SELECT * FROM athletes WHERE email = ? COLLATE NOCASE")
    .get(email.trim()) as AthleteRow | undefined;
}

export function getAthleteByToken(token: string): AthleteRow | undefined {
  return getDb()
    .prepare("SELECT * FROM athletes WHERE device_token = ?")
    .get(token) as AthleteRow | undefined;
}

export function setAthleteTeam(athleteId: number, teamId: number | null): void {
  getDb().prepare("UPDATE athletes SET team_id = ? WHERE id = ?").run(teamId, athleteId);
}

export function createAthleteAccount(a: {
  name: string;
  email: string;
  password_hash: string;
  team_id: number | null;
  grade?: number | null;
  sex?: string | null;
  event_group?: string | null;
}): AthleteRow {
  const db = getDb();
  const hue = 180 + Math.floor(Math.random() * 160);
  const token = newDeviceToken();
  const info = db
    .prepare(
      `INSERT INTO athletes (name, email, password_hash, team_id, grade, sex, event_group, avatar_hue, device_token)
       VALUES (@name, @email, @password_hash, @team_id, @grade, @sex, @event_group, @avatar_hue, @device_token)`
    )
    .run({
      grade: null,
      sex: null,
      event_group: "distance",
      ...a,
      avatar_hue: hue,
      device_token: token,
    });
  return getAthlete(Number(info.lastInsertRowid))!;
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
};

export function listAthletes(): AthleteRow[] {
  return getDb().prepare("SELECT * FROM athletes ORDER BY name").all() as AthleteRow[];
}

export function getAthlete(id: number): AthleteRow | undefined {
  return getDb().prepare("SELECT * FROM athletes WHERE id = ?").get(id) as
    | AthleteRow
    | undefined;
}

export function activitiesForAthlete(athleteId: number, sinceIso: string): ActivityRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM activities WHERE athlete_id = ? AND start_time >= ? ORDER BY start_time"
    )
    .all(athleteId, sinceIso) as ActivityRow[];
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

export function upcomingRaces(scope: { athleteId: number; teamId: number | null }): RaceRow[] {
  const today = new Date().toISOString().slice(0, 10);
  return getDb()
    .prepare(
      `SELECT * FROM races WHERE date >= ?
         AND (created_by_athlete_id = ?
              OR (created_by_athlete_id IS NULL AND team_id IS NOT NULL AND team_id = ?))
       ORDER BY date`
    )
    .all(today, scope.athleteId, scope.teamId) as RaceRow[];
}

export function createRace(r: {
  name: string;
  date: string;
  event: string;
  distance_m: number;
  location?: string | null;
  created_by_athlete_id: number;
  team_id: number | null;
}): RaceRow {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO races (name, date, event, distance_m, location, created_by_athlete_id, team_id)
       VALUES (@name, @date, @event, @distance_m, @location, @created_by_athlete_id, @team_id)`
    )
    .run({ location: null, ...r });
  return db.prepare("SELECT * FROM races WHERE id = ?").get(info.lastInsertRowid) as RaceRow;
}

export function updateRace(
  id: number,
  athleteId: number,
  patch: Partial<Pick<RaceRow, "name" | "date" | "event" | "distance_m" | "location">>
): boolean {
  const db = getDb();
  const race = db.prepare("SELECT * FROM races WHERE id = ?").get(id) as RaceRow | undefined;
  if (!race || race.created_by_athlete_id !== athleteId) return false;
  const fields = Object.keys(patch);
  if (!fields.length) return true;
  const sets = fields.map((f) => `${f} = @${f}`).join(", ");
  db.prepare(`UPDATE races SET ${sets} WHERE id = @id`).run({ ...patch, id });
  return true;
}

export function deleteRace(id: number, athleteId: number): boolean {
  const db = getDb();
  const race = db.prepare("SELECT * FROM races WHERE id = ?").get(id) as RaceRow | undefined;
  if (!race || race.created_by_athlete_id !== athleteId) return false;
  db.prepare("DELETE FROM races WHERE id = ?").run(id);
  return true;
}

export function raceResultsForAthlete(athleteId: number): RaceResultRow[] {
  return getDb()
    .prepare("SELECT * FROM race_results WHERE athlete_id = ? ORDER BY date")
    .all(athleteId) as RaceResultRow[];
}

export function checkinsForAthlete(athleteId: number, sinceIso: string): CheckinRow[] {
  return getDb()
    .prepare("SELECT * FROM checkins WHERE athlete_id = ? AND date >= ? ORDER BY date")
    .all(athleteId, sinceIso.slice(0, 10)) as CheckinRow[];
}

export function injuriesForAthlete(athleteId: number): InjuryRow[] {
  return getDb()
    .prepare("SELECT * FROM injuries WHERE athlete_id = ? ORDER BY date DESC")
    .all(athleteId) as InjuryRow[];
}

export function goalsForAthlete(athleteId: number): GoalRow[] {
  return getDb()
    .prepare("SELECT * FROM goals WHERE athlete_id = ?")
    .all(athleteId) as GoalRow[];
}

export function upsertCheckin(c: {
  athlete_id: number;
  date: string;
  rpe?: number | null;
  soreness_part?: string | null;
  soreness_severity?: number | null;
  energy?: number | null;
  motivation?: number | null;
  academic_stress?: number | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO checkins (athlete_id, date, rpe, soreness_part, soreness_severity, energy, motivation, academic_stress)
       VALUES (@athlete_id, @date, @rpe, @soreness_part, @soreness_severity, @energy, @motivation, @academic_stress)
       ON CONFLICT(athlete_id, date) DO UPDATE SET
         rpe = COALESCE(excluded.rpe, checkins.rpe),
         soreness_part = COALESCE(excluded.soreness_part, checkins.soreness_part),
         soreness_severity = COALESCE(excluded.soreness_severity, checkins.soreness_severity),
         energy = COALESCE(excluded.energy, checkins.energy),
         motivation = COALESCE(excluded.motivation, checkins.motivation),
         academic_stress = COALESCE(excluded.academic_stress, checkins.academic_stress)`
    )
    .run({
      rpe: null,
      soreness_part: null,
      soreness_severity: null,
      energy: null,
      motivation: null,
      academic_stress: null,
      ...c,
    });
}

export function sorenessForCheckin(athleteId: number, date: string): CheckinSorenessRow[] {
  return getDb()
    .prepare("SELECT * FROM checkin_soreness WHERE athlete_id = ? AND date = ? ORDER BY severity DESC")
    .all(athleteId, date) as CheckinSorenessRow[];
}

export function upsertCheckinSoreness(s: {
  athlete_id: number;
  date: string;
  body_part: string;
  severity: number;
}): void {
  const db = getDb();
  upsertCheckin({ athlete_id: s.athlete_id, date: s.date });
  const checkin = db
    .prepare("SELECT id FROM checkins WHERE athlete_id = ? AND date = ?")
    .get(s.athlete_id, s.date) as { id: number };
  db.prepare(
    `INSERT INTO checkin_soreness (checkin_id, athlete_id, date, body_part, severity)
     VALUES (@checkin_id, @athlete_id, @date, @body_part, @severity)
     ON CONFLICT(athlete_id, date, body_part) DO UPDATE SET
       severity = excluded.severity, checkin_id = excluded.checkin_id`
  ).run({ ...s, checkin_id: checkin.id });
}

export function clearCheckinSoreness(s: { athlete_id: number; date: string; body_part: string }): void {
  getDb()
    .prepare("DELETE FROM checkin_soreness WHERE athlete_id = ? AND date = ? AND body_part = ?")
    .run(s.athlete_id, s.date, s.body_part);
}

export function metricsForAthlete(athleteId: number, sinceIso: string): MetricRow[] {
  const sinceDay = sinceIso.slice(0, 10);
  return getDb()
    .prepare(
      "SELECT * FROM health_metrics WHERE athlete_id = ? AND date >= ? ORDER BY date"
    )
    .all(athleteId, sinceDay) as MetricRow[];
}

/** Insert or merge a day's recovery metrics — only overwrites fields that arrive non-null. */
export function upsertMetric(m: {
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
}): void {
  getDb()
    .prepare(
      `INSERT INTO health_metrics
        (athlete_id, date, resting_hr, hrv, sleep_hours, vo2max, resp_rate, spo2, wrist_temp, sleep_deep, sleep_rem, sleep_light, sleep_awake, source, updated_at)
       VALUES (@athlete_id, @date, @resting_hr, @hrv, @sleep_hours, @vo2max, @resp_rate, @spo2, @wrist_temp, @sleep_deep, @sleep_rem, @sleep_light, @sleep_awake, @source, datetime('now'))
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
         updated_at  = datetime('now')`
    )
    .run({
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
    });
}

export function insertActivity(a: {
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
}): boolean {
  const res = getDb()
    .prepare(
      `INSERT OR IGNORE INTO activities
       (athlete_id, source, external_id, name, type, start_time, distance_m, duration_s, avg_hr, max_hr, elevation_gain_m, calories, cadence)
       VALUES (@athlete_id, @source, @external_id, @name, @type, @start_time, @distance_m, @duration_s, @avg_hr, @max_hr, @elevation_gain_m, @calories, @cadence)`
    )
    .run({
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
    });
  return res.changes > 0;
}
