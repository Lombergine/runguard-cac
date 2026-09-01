-- Pending Google sign-in handshakes.
--
-- Applied ONCE by hand, like every migration in this folder — the Supabase
-- schema is deliberately not created at runtime, because concurrent serverless
-- instances would race the DDL.
--
-- WHY A TABLE AND NOT A SELF-CONTAINED STATE TOKEN. Same reason the Strava one
-- needed it (see the deleted 0002, recoverable from git): single use cannot be
-- expressed in a token that carries its own proof. Something server-side has to
-- remember the state was spent. This row is that memory, and the callback
-- deletes it in the same statement that reads it, so exactly one redemption of
-- a given nonce can win.
--
-- WHAT IS DIFFERENT FROM THE STRAVA ONE, AND WHY IT MATTERS. That table stored
-- an athlete_id, because the handshake was started by an already-authenticated
-- athlete and the callback wrote tokens onto that athlete's row — the row WAS
-- the permission. Nobody is authenticated when a sign-in starts, so this table
-- cannot and must not name a user. It stores only which door was knocked on.
-- The identity comes from Google's verified email at the far end.
--
-- That makes the threat here login-CSRF rather than account takeover: without a
-- state check, an attacker can complete their own Google handshake and hand the
-- resulting callback URL to a victim, silently signing that victim's browser
-- into the attacker's account. Single-use + TTL + an unguessable nonce is what
-- closes it.
CREATE TABLE IF NOT EXISTS public.google_oauth_states (
  nonce         text PRIMARY KEY,
  role          text NOT NULL,            -- 'coach' | 'athlete' — which door
  code_verifier text NOT NULL,            -- PKCE; never leaves the server
  expires_at    bigint NOT NULL           -- unix seconds; ~10 minutes out
);

-- Abandoned handshakes are swept on each new one (see issueState), which needs
-- this to stay a range scan rather than a table scan.
CREATE INDEX IF NOT EXISTS idx_google_oauth_states_expires
  ON public.google_oauth_states (expires_at);

-- Same posture as every other table: the app connects through the pooler as the
-- postgres role and bypasses RLS, so this changes nothing for the server. It
-- exists so no anon key can read a pending handshake or mint one. RLS on with
-- no policy denies everyone else by default, which is intended.
ALTER TABLE public.google_oauth_states ENABLE ROW LEVEL SECURITY;
