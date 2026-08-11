/**
 * The local SQLite schema, applied on connect.
 *
 * This is the dev-file path only. The Supabase schema is NOT created at runtime —
 * it lives in supabase/migrations/ and is applied once, deliberately: concurrent
 * serverless instances would race the DDL, and pragma_table_info (used by the
 * additive migrations below) does not exist in Postgres.
 *
 * Moved verbatim out of db.ts when the driver switch was added. Unchanged.
 */
import type Database from "better-sqlite3";

export function applySqliteSchema(db: Database.Database): void {
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

    -- chatSummary() reads this on EVERY athlete page render, not just chat, so the
    -- unindexed scan sat on the dashboard's hot path. Cost without it depends on
    -- rowid position, which makes the worst case a dormant athlete — exactly the
    -- one a coach opens.
    CREATE INDEX IF NOT EXISTS idx_chat_messages_athlete_id
      ON chat_messages(athlete_id, id);

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

    -- One row per athlete per day: what the engine saw, kept even though none of
    -- it is shown as a score any more.
    --
    -- The engine recomputes from scratch on every request, so without this the
    -- state preceding an injury is unrecoverable. Paired with the injuries
    -- table these rows are the only thing that could ever justify a real score:
    -- a season of them, labelled by what actually happened to these athletes,
    -- is what a future model would be fitted on instead of borrowed coefficients
    -- from a cohort of middle-aged Danes.
    CREATE TABLE IF NOT EXISTS risk_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      date TEXT NOT NULL,             -- YYYY-MM-DD the features describe
      acwr REAL,
      ramp_pct REAL,
      monotony REAL,
      days_since_rest INTEGER,
      week_km REAL,
      rhr_delta REAL,
      hrv_delta_pct REAL,
      sleep_avg REAL,
      soreness_max REAL,
      soreness_days_7 INTEGER,
      energy REAL,
      readiness INTEGER,
      -- the one load pattern the running evidence supports
      spike_pct_above REAL,           -- null = no spike that day
      spike_km REAL,
      hr_max REAL,
      hr_max_source TEXT,
      legacy_risk_score INTEGER,      -- kept for comparison, never displayed
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(athlete_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_athlete_date
      ON risk_snapshots(athlete_id, date);

    -- One row per outstanding Strava OAuth handshake. The row IS the permission
    -- to write tokens onto an athlete: /api/strava/connect creates it after
    -- authenticating the caller, and the callback deletes it as it redeems it.
    -- A replayed callback URL therefore finds nothing and is refused. See the
    -- state notes in src/lib/strava.ts.
    CREATE TABLE IF NOT EXISTS strava_oauth_states (
      nonce TEXT PRIMARY KEY,
      athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL     -- unix seconds
    );
  `);

  // Additive migrations for columns introduced after first release.
  //
  // Checked rather than caught, deliberately. SQLite gives "duplicate column name"
  // and "no such table" the same error code, so a bare catch could not tell an
  // already-applied migration from a typo'd table name even in principle — and it
  // swallowed SQLITE_READONLY and SQLITE_BUSY too, which then surfaced much later
  // as an unrelated 500. pragma_table_info on a missing table returns empty rather
  // than throwing, so a real fault still propagates from the ALTER.
  const addColumn = (table: string, ddl: string) => {
    const col = ddl.split(/\s+/)[0];
    const has = db
      .prepare("SELECT 1 FROM pragma_table_info(?) WHERE name = ?")
      .get(table, col);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  addColumn("health_metrics", "spo2 REAL");            // %
  addColumn("health_metrics", "wrist_temp REAL");      // deviation °C
  addColumn("health_metrics", "sleep_deep REAL");      // hours
  addColumn("health_metrics", "sleep_rem REAL");
  addColumn("health_metrics", "sleep_light REAL");
  addColumn("health_metrics", "sleep_awake REAL");
  addColumn("activities", "calories REAL");            // active kcal
  addColumn("activities", "cadence REAL");             // steps/min
  addColumn("activities", "route TEXT");               // encoded polyline, for the detail map
  // real-account columns on athletes
  addColumn("athletes", "team_id INTEGER");
  addColumn("athletes", "email TEXT");
  addColumn("athletes", "password_hash TEXT");
  addColumn("injuries", "resolved_at TEXT");           // null = still active
  addColumn("races", "created_by_athlete_id INTEGER REFERENCES athletes(id)"); // null = coach/seed-created
  addColumn("races", "team_id INTEGER REFERENCES teams(id)");
  // Max heart rate. null = the athlete hasn't set one, so it gets resolved from
  // their workout history or their age at read time — see src/lib/hrmax.ts.
  addColumn("athletes", "hr_max REAL");
  addColumn("athletes", "hr_max_source TEXT"); // 'manual' | 'calibrated'
  // Which path produced a chat row: 'rules' | 'safety:<id>'. Written on BOTH the
  // user and assistant rows of a safety-intercepted exchange, which is what lets
  // chatSummary keep those disclosures off the coach's screen.
  addColumn("chat_messages", "engine TEXT");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_races_created_by ON races(created_by_athlete_id);
    CREATE INDEX IF NOT EXISTS idx_races_team ON races(team_id);
  `);
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_athletes_email ON athletes(email) WHERE email IS NOT NULL");
  } catch {
    /* index exists */
  }
}
