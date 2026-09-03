-- Remove the last of the Strava integration from Supabase.
--
-- Applied ONCE by hand, like every migration in this folder — the Supabase
-- schema is deliberately not created at runtime, because concurrent serverless
-- instances would race the DDL.
--
-- WHAT THIS DROPS AND WHY IT IS LOSSLESS. Verified against the live database
-- before writing: all four columns are NULL on all 14 athlete rows, and no
-- activity has ever carried `source = 'strava'` (every one of the 4,117 is
-- 'healthkit'). There is nothing here to preserve.
--
-- WHY IT IS WORTH A MIGRATION AT ALL RATHER THAN LEAVING EMPTY COLUMNS. Two of
-- these columns are named `*_token`. A column that is documented as a credential
-- is a place a future writer will put one — and an OAuth path nobody owns any
-- more is exactly the path nobody would audit. DEPLOY.md's credential list is
-- five items now, and it is only true if the column is gone.
--
-- strava_oauth_states never existed here: migration 0002 created it but was
-- never applied to this project, and the file is deleted alongside this one.
-- IF EXISTS covers any database where it did land.
DROP TABLE IF EXISTS public.strava_oauth_states;

ALTER TABLE public.athletes DROP COLUMN IF EXISTS strava_athlete_id;
ALTER TABLE public.athletes DROP COLUMN IF EXISTS strava_access_token;
ALTER TABLE public.athletes DROP COLUMN IF EXISTS strava_refresh_token;
ALTER TABLE public.athletes DROP COLUMN IF EXISTS strava_expires_at;
