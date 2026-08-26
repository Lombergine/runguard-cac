-- Race detail.
--
-- `races` carried name/date/event/distance/location and nothing else, which is
-- why the upcoming-race card had nothing to show beyond a countdown, and why
-- "add a race" was a five-field form for something a coach thinks about in far
-- more detail than that.
--
-- `race_results` has had `splits` and `conditions` since first release, but no
-- code path ever wrote either — only the seeder did. Those two are not added
-- here (they already exist); `notes` is.
--
-- Every column is nullable with no default. A race recorded before this
-- migration is still a complete race, and every read path renders null as
-- "not recorded" rather than as a blank that could be mistaken for an answer.
--
-- Mirrors the addColumn() calls in src/lib/db/schema.sqlite.ts. IF NOT EXISTS
-- so re-running against a partially migrated database is a no-op rather than an
-- error, matching how the SQLite side checks pragma_table_info first.

ALTER TABLE public.races ADD COLUMN IF NOT EXISTS start_time  text;
ALTER TABLE public.races ADD COLUMN IF NOT EXISTS course_type text;
ALTER TABLE public.races ADD COLUMN IF NOT EXISTS priority    text;
ALTER TABLE public.races ADD COLUMN IF NOT EXISTS notes       text;

ALTER TABLE public.race_results ADD COLUMN IF NOT EXISTS notes text;
