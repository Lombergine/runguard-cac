-- Make the Strava OAuth `state` single-use.
--
-- Applied ONCE by hand, like 0001 — the Supabase schema is deliberately not
-- created at runtime (concurrent serverless instances would race the DDL).
-- The SQLite side of this table is created in src/lib/db/schema.sqlite.ts.
--
-- WHY IT EXISTS. `state` used to be a 64-bit HMAC over the athlete id with no
-- expiry and no record of having been spent, so one observed callback URL
-- (referrer, proxy log, shared browser history) could be replayed forever, and
-- every replay overwrote that athlete's Strava tokens with whichever account
-- the replayer authorised. Single use cannot be expressed in a self-contained
-- token: something server-side has to remember that the token was spent.
--
-- This row IS that memory, and it is also the permission itself.
-- /api/strava/connect inserts it only after resolveAthlete() has authenticated
-- the caller; /api/strava/callback deletes it in the same statement that reads
-- it, so exactly one redemption can win and the athlete id the callback writes
-- against comes from this row rather than from the URL.
CREATE TABLE IF NOT EXISTS public.strava_oauth_states (
  nonce      text PRIMARY KEY,
  athlete_id integer NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  expires_at bigint NOT NULL              -- unix seconds; ~10 minutes out
);

-- Expired rows are swept on each new handshake (see issueState), which needs
-- this to stay a range scan rather than a table scan.
CREATE INDEX IF NOT EXISTS idx_strava_oauth_states_expires
  ON public.strava_oauth_states (expires_at);

-- Same posture as risk_snapshots: the app connects through the pooler as the
-- postgres role and bypasses RLS, so this changes nothing for the server. It
-- exists so no anon/authenticated key can read or mint a pending handshake.
-- RLS on with no policy denies everyone else by default, which is intended.
ALTER TABLE public.strava_oauth_states ENABLE ROW LEVEL SECURITY;
