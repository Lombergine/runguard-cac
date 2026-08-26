-- The coach's training calendar.
--
-- One row per team per calendar day. A row means "the coach wrote this
-- session"; no row means the generated weekly template stands for that day,
-- which is what every team had before this table existed.
--
-- Deliberately sparse. A coach who fills in Tuesday and Thursday has written
-- two rows, not seven, and the other five days keep adapting per athlete.
--
-- UNIQUE(team_id, date) is what makes the editor an upsert rather than an
-- append: clicking the same day twice edits that day instead of stacking a
-- second session behind the first where nobody can see it. It is also the
-- constraint the ON CONFLICT clause in upsertTeamPlanDay targets, so it is
-- required, not merely a good idea.
--
-- distance_m is nullable because a rest day has no distance, and because a
-- coach who writes "hills, 40 minutes" has not given one. Null means "not
-- specified" on every read path and is never rendered as 0.
--
-- Types and shape follow 0001: integer identity key, integer FK, text
-- timestamps written the way nowStamp() writes them on the SQLite side, so a
-- row does not read differently depending on which driver created it.
--
-- Mirrors the CREATE TABLE in src/lib/db/schema.sqlite.ts.
CREATE TABLE IF NOT EXISTS public.team_plan_days (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id     integer NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  date        text NOT NULL,            -- YYYY-MM-DD, local calendar day
  type        text NOT NULL,            -- 'Easy run' | 'Rest' | free text the coach typed
  distance_m  double precision,         -- null = not specified
  target_pace text,                     -- free text, e.g. '7:30/mi'
  details     text,                     -- what to actually do
  why         text,                     -- the point of it, shown to the athlete
  updated_at  text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS'),
  updated_by  text,                     -- coach name at write time, for the audit line
  UNIQUE (team_id, date)
);

CREATE INDEX IF NOT EXISTS idx_team_plan_days_team_date
  ON public.team_plan_days (team_id, date);

-- Same posture as risk_snapshots and the rest: the app connects through the
-- pooler as the postgres role and bypasses RLS, so this changes nothing for the
-- server. It exists so that no anon/authenticated key can read or rewrite a
-- team's training plan directly. RLS on with no policy denies everyone else by
-- default, which is the intended posture.
ALTER TABLE public.team_plan_days ENABLE ROW LEVEL SECURITY;
