-- The whole schema, from nothing.
--
-- WHY THIS FILE EXISTS, AND WHY IT IS NUMBERED 0000 RATHER THAN 0006. Until now
-- this folder could not create a database. 0001 opens with "the project already
-- had every table except risk_snapshots" — the tables came from an older repo
-- lineage that was never checked in, so every migration here is a delta against
-- a base that existed only inside one Supabase project. Standing up a second
-- project (a new account, a staging copy, a restore after an accident) was not
-- a thing this repository could do.
--
-- This is that base. It was DERIVED FROM THE RUNNING PRODUCTION SCHEMA — column
-- types, identity columns, every UNIQUE constraint the ON CONFLICT clauses in
-- db.ts target, every foreign key and all nine indexes read back out of the
-- live database — not hand-translated from schema.sqlite.ts. A translation is a
-- guess about a database that already works; this is a description of one.
--
-- ORDER OF APPLICATION for a fresh project: this file alone. 0001, 0003 and 0004
-- are already folded in, and 0005's removals were simply never added. Applying
-- them afterwards is harmless (every statement in them is IF NOT EXISTS or
-- IF EXISTS) but unnecessary.
--
-- ── Three deliberate differences from the project this was read out of ──────
--
-- 1. NO teams.auth_user_id. It is a nullable uuid from the same older lineage,
--    referenced by no code in src/ and null on every row. A column nothing reads
--    is a question every future reader has to answer once.
--
-- 2. TIMESTAMP DEFAULTS ARE CONSISTENT. Production has two different ones:
--    `(now())::text` on most tables, which yields '2026-08-29 21:20:01.433+00',
--    and to_char(...'YYYY-MM-DD HH24:MI:SS') on risk_snapshots and
--    team_plan_days. The second is right and the first is a bug nobody has hit
--    yet: SQLite's datetime('now') and nowStamp() in db.ts both produce the
--    second form, so a row's created_at currently reads differently depending on
--    which driver and which table created it — and these columns are text, so no
--    type error ever surfaces it. A new database is the only place this is free
--    to fix, so all fifteen tables use the nowStamp() form here.
--
-- 3. activities.splits / hr_series / elev_series ARE PRESENT. They exist in
--    production and src/app/athlete/activity/[id]/page.tsx reads all three, but
--    they were never added to schema.sqlite.ts — so local SQLite has no such
--    columns and those reads come back undefined rather than null. Fixed on the
--    SQLite side in the same change as this file.
--
-- RLS IS ENABLED ON EVERY TABLE WITH NO POLICIES, matching production, and that
-- is the intended configuration rather than an unfinished one. The app connects
-- as the postgres role through the pooler, which bypasses RLS; there is no
-- anon-key path and no supabase-js client anywhere in this repo. Enabled-with-no-
-- policies is therefore what makes the project's public REST surface return
-- nothing to anyone. Do not "fix" it by adding permissive policies.

-- ── teams ────────────────────────────────────────────────────────────────────
CREATE TABLE public.teams (
  id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                text NOT NULL,
  join_code           text NOT NULL UNIQUE,   -- athletes join with this
  coach_name          text,
  coach_email         text UNIQUE,
  coach_password_hash text,
  created_at          text DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);

-- ── athletes ─────────────────────────────────────────────────────────────────
-- device_token is a credential: it reads this athlete's whole profile and writes
-- HealthKit data on their behalf, and it never expires. UNIQUE because it is the
-- lookup key in getAthleteByToken().
CREATE TABLE public.athletes (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL,
  grade         integer,
  sex           text,
  event_group   text,                          -- 'distance' | 'mid' | 'sprint'
  avatar_hue    integer DEFAULT 210,
  device_token  text UNIQUE,
  team_id       integer REFERENCES public.teams(id),
  email         text,
  password_hash text,
  created_at    text DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  hr_max        double precision,
  hr_max_source text                           -- 'manual' | 'calibrated'; null = resolve automatically
);

-- Partial, so many athletes may have no email but no two may share one.
CREATE UNIQUE INDEX idx_athletes_email ON public.athletes (email) WHERE email IS NOT NULL;

-- ── races ────────────────────────────────────────────────────────────────────
-- created_by_athlete_id is nullable and NOT cascading on purpose: a race is a
-- team fixture that outlives the athlete who entered it. scripts/delete-athlete.ts
-- nulls this rather than deleting the race.
CREATE TABLE public.races (
  id                    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                  text NOT NULL,
  date                  text NOT NULL,         -- YYYY-MM-DD
  event                 text NOT NULL,         -- '800m' | 'Mile' | '5K' | 'XC 5K'
  distance_m            double precision NOT NULL,
  location              text,
  created_by_athlete_id integer REFERENCES public.athletes(id),  -- null = coach/seed-created
  team_id               integer REFERENCES public.teams(id),
  start_time            text,                  -- 'HH:MM' local, gun time
  course_type           text,                  -- 'Track' | 'Cross country' | 'Road' | 'Trail'
  priority              text,                  -- 'A' | 'B' | 'C'
  notes                 text
);
CREATE INDEX idx_races_created_by ON public.races (created_by_athlete_id);
CREATE INDEX idx_races_team       ON public.races (team_id);

-- ── activities ───────────────────────────────────────────────────────────────
-- UNIQUE(athlete_id, source, external_id) is what makes re-syncing a window free:
-- insertActivity() targets it with ON CONFLICT DO NOTHING, and external_id holds
-- HealthKit's own sample uuid. It is required, not an optimisation.
CREATE TABLE public.activities (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id       integer NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  source           text NOT NULL,              -- 'healthkit' | 'apple_export' | 'seed'
  external_id      text,
  name             text,
  type             text DEFAULT 'Run',
  start_time       text NOT NULL,
  distance_m       double precision DEFAULT 0,
  duration_s       double precision DEFAULT 0,
  avg_hr           double precision,
  max_hr           double precision,
  elevation_gain_m double precision,
  calories         double precision,
  cadence          double precision,
  created_at       text DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  route            text,                       -- encoded polyline
  -- Per-run detail as JSON text. Null means the source never recorded it, which
  -- today is every real run; the UI renders "not recorded" rather than deriving
  -- a plausible number, because a coach can act on a mile split.
  splits           text,
  hr_series        text,
  elev_series      text,
  UNIQUE (athlete_id, source, external_id)
);
CREATE INDEX idx_activities_athlete_time ON public.activities (athlete_id, start_time);

-- ── race_results ─────────────────────────────────────────────────────────────
CREATE TABLE public.race_results (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id integer NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  race_id    integer REFERENCES public.races(id),
  event      text NOT NULL,
  date       text NOT NULL,
  time_s     double precision NOT NULL,
  place      integer,
  feel       text,                             -- 'great' | 'ok' | 'rough'
  splits     text,                             -- JSON array of split seconds
  conditions text,
  created_at text DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  notes      text
);

-- ── checkins ─────────────────────────────────────────────────────────────────
-- UNIQUE(athlete_id, date) is the ON CONFLICT target for upsertCheckin(), which
-- merges with COALESCE so a partial check-in never blanks a stored field.
CREATE TABLE public.checkins (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id        integer NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  date              text NOT NULL,             -- YYYY-MM-DD, local calendar day
  rpe               double precision,          -- 1-10 session effort
  soreness_part     text,
  soreness_severity double precision,
  energy            double precision,
  motivation        double precision,
  academic_stress   integer,                   -- 0/1
  UNIQUE (athlete_id, date)
);

-- ── checkin_soreness ─────────────────────────────────────────────────────────
CREATE TABLE public.checkin_soreness (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checkin_id integer NOT NULL REFERENCES public.checkins(id) ON DELETE CASCADE,
  athlete_id integer NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  date       text NOT NULL,
  body_part  text NOT NULL,
  severity   double precision NOT NULL,        -- 0-10
  UNIQUE (athlete_id, date, body_part)
);
CREATE INDEX idx_checkin_soreness_athlete_date ON public.checkin_soreness (athlete_id, date);

-- ── injuries ─────────────────────────────────────────────────────────────────
CREATE TABLE public.injuries (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id  integer NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  date        text NOT NULL,
  body_part   text NOT NULL,
  note        text,
  resolved_at text                             -- null = still active
);

-- ── goals ────────────────────────────────────────────────────────────────────
CREATE TABLE public.goals (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id integer NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  event      text NOT NULL,
  target     double precision NOT NULL,
  UNIQUE (athlete_id, event)
);

-- ── chat_messages ────────────────────────────────────────────────────────────
-- `engine` records which path produced a row: 'rules' | 'safety:<id>'. It is
-- written on BOTH rows of a safety-intercepted exchange, and it is what lets
-- chatSummary keep those disclosures off the coach's screen. Without the column
-- the coach view cannot filter them, so it is load-bearing for safety, not
-- diagnostics.
CREATE TABLE public.chat_messages (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id integer NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  role       text NOT NULL,                    -- 'user' | 'assistant'
  text       text NOT NULL,
  created_at text DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  engine     text
);
CREATE INDEX idx_chat_messages_athlete_id ON public.chat_messages (athlete_id, id);

-- ── workout_status ───────────────────────────────────────────────────────────
CREATE TABLE public.workout_status (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id integer NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  date       text NOT NULL,
  status     text NOT NULL,
  UNIQUE (athlete_id, date)
);

-- ── health_metrics ───────────────────────────────────────────────────────────
-- Every reading is nullable and independently absent: a watch worn without sleep
-- tracking reports resting_hr and nothing else. Null means NOT RECORDED and is
-- never rendered as 0 — upsertMetric() merges with COALESCE so a later partial
-- payload cannot blank a reading that did arrive.
CREATE TABLE public.health_metrics (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id  integer NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  date        text NOT NULL,                   -- YYYY-MM-DD, local calendar day
  resting_hr  double precision,
  hrv         double precision,
  sleep_hours double precision,
  vo2max      double precision,
  resp_rate   double precision,
  spo2        double precision,                -- %
  wrist_temp  double precision,                -- deviation °C, may be negative
  sleep_deep  double precision,
  sleep_rem   double precision,
  sleep_light double precision,
  sleep_awake double precision,
  source      text DEFAULT 'healthkit',
  updated_at  text DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE (athlete_id, date)
);
CREATE INDEX idx_metrics_athlete_date ON public.health_metrics (athlete_id, date);

-- ── risk_snapshots ───────────────────────────────────────────────────────────
CREATE TABLE public.risk_snapshots (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id        integer NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  date              text NOT NULL,
  acwr              double precision,
  ramp_pct          double precision,
  monotony          double precision,
  days_since_rest   integer,
  week_km           double precision,
  rhr_delta         double precision,
  hrv_delta_pct     double precision,
  sleep_avg         double precision,
  soreness_max      double precision,
  soreness_days_7   integer,
  energy            double precision,
  readiness         integer,
  spike_pct_above   double precision,
  spike_km          double precision,
  hr_max            double precision,
  hr_max_source     text,
  legacy_risk_score integer,
  created_at        text DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE (athlete_id, date)
);
CREATE INDEX idx_snapshots_athlete_date ON public.risk_snapshots (athlete_id, date);

-- ── team_plan_days ───────────────────────────────────────────────────────────
-- Deliberately sparse: a row means "the coach wrote this session", no row means
-- the generated template stands for that day. distance_m is nullable because a
-- rest day has no distance and "hills, 40 minutes" does not give one.
CREATE TABLE public.team_plan_days (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id     integer NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  date        text NOT NULL,
  type        text NOT NULL,                   -- 'Easy run' | 'Rest' | free text
  distance_m  double precision,                -- null = not specified
  target_pace text,
  details     text,
  why         text,
  updated_at  text DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  updated_by  text,                            -- coach name at write time
  UNIQUE (team_id, date)
);
CREATE INDEX idx_team_plan_days_team_date ON public.team_plan_days (team_id, date);

-- ── waitlist ─────────────────────────────────────────────────────────────────
CREATE TABLE public.waitlist (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      text NOT NULL UNIQUE,
  role       text,                             -- 'coach' | 'athlete' | 'parent' | other
  created_at text DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- See the header. Enabled, no policies, on purpose.
ALTER TABLE public.teams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athletes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.races            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_results     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_soreness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.injuries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_status   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_metrics   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_plan_days   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist         ENABLE ROW LEVEL SECURITY;
