-- Bring the Supabase schema up to what src/lib/db.ts expects.
--
-- Applied ONCE, deliberately not at runtime: concurrent serverless instances
-- would race the DDL, and the additive migrations in schema.sqlite.ts use
-- pragma_table_info, which does not exist in Postgres.
--
-- This is a delta, not a rebuild. The project already had every table except
-- risk_snapshots, with matching column types, every UNIQUE constraint the
-- ON CONFLICT clauses target, and identity columns. Nothing here drops or
-- rewrites existing data.
--
-- Two columns that exist here but not in SQLite are left alone: activities.route
-- and teams.auth_user_id, both nullable, both from the other repo lineage.

-- 1. Which path produced a chat row: 'rules' | 'safety:<id>'. Written on BOTH
--    rows of a safety-intercepted exchange, which is what lets chatSummary keep
--    those disclosures off the coach's screen. Without this column the coach
--    view cannot filter them.
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS engine text;

-- 2. chatSummary() reads chat_messages on EVERY athlete page render, not just
--    chat, so an unindexed scan sits on the dashboard's hot path.
CREATE INDEX IF NOT EXISTS idx_chat_messages_athlete_id
  ON public.chat_messages (athlete_id, id);

-- 3. One row per athlete per day: what the engine saw, kept even though none of
--    it is shown as a score any more.
--
--    The engine recomputes from scratch on every request, so without this the
--    state preceding an injury is unrecoverable. Paired with the injuries table
--    these rows are the only thing that could ever justify a real score: a
--    season of them, labelled by what actually happened to these athletes, is
--    what a future model would be fitted on instead of borrowed coefficients
--    from a cohort of middle-aged Danes.
CREATE TABLE IF NOT EXISTS public.risk_snapshots (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id        integer NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  date              text NOT NULL,          -- YYYY-MM-DD the features describe
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
  -- the one load pattern the running evidence supports
  spike_pct_above   double precision,       -- null = no spike that day
  spike_km          double precision,
  hr_max            double precision,
  hr_max_source     text,
  legacy_risk_score integer,                -- kept for comparison, never displayed
  created_at        text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE (athlete_id, date)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_athlete_date
  ON public.risk_snapshots (athlete_id, date);

-- Every other table in this project has RLS on. The app connects through the
-- pooler as the postgres role, which bypasses RLS entirely, so this changes
-- nothing for the server — it exists so that no anon/authenticated key can ever
-- read a minor's daily training features directly. Access control remains
-- src/lib/apiAuth.ts. Enabling RLS with no policy denies everyone else by
-- default, which is the intended posture.
ALTER TABLE public.risk_snapshots ENABLE ROW LEVEL SECURITY;
