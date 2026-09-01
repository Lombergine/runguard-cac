-- Account recovery by email, and the revocation that makes it mean something.
--
-- Applied ONCE by hand, like every migration in this folder — the Supabase
-- schema is deliberately not created at runtime, because concurrent serverless
-- instances would race the DDL.
--
-- ── token_version ───────────────────────────────────────────────────────────
--
-- WHY A RESET NEEDS THIS. Session tokens are stateless HMACs over an id, and
-- `verifyAthleteToken` re-signs and compares with no database read at all. That
-- is fast, and it means a session cannot be revoked: changing a password left
-- every token ever minted for that account working, for up to 180 days on the
-- athlete cookie. The only revocation was rotating SESSION_SECRET, which signs
-- out every athlete and every coach at once.
--
-- For ordinary sign-in that was a reasonable trade. For RECOVERY it is not: the
-- reason someone recovers an account is usually that somebody else is in it, and
-- a reset that leaves the intruder's session live has not recovered anything.
--
-- Folding this counter into the signed message and bumping it on reset makes
-- every previously issued token fail verification. The cost is one indexed
-- primary-key read per session check, where there were none.
--
-- THIS SIGNS EVERYONE OUT ONCE, on the deploy that ships it: the signed message
-- changes shape, so tokens minted before it no longer verify. Everyone signs in
-- again. There is no migration path that avoids that and none worth building.
ALTER TABLE public.athletes ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
ALTER TABLE public.teams    ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

-- ── password_resets ─────────────────────────────────────────────────────────
--
-- THE HASH IS THE PRIMARY KEY, AND THE PLAINTEXT IS NEVER STORED. What goes in
-- the email is 32 random bytes; what is kept here is its SHA-256. So this table
-- read in full — a leaked backup, a mis-scoped query, a support screenshot —
-- yields nothing that can reset anybody's password, which is not true of a table
-- that stores the token itself.
--
-- SHA-256 rather than scrypt on purpose, and it is not the same decision as
-- `athletes.password_hash`. A password is low-entropy and guessable, so it needs
-- a slow hash to make guessing expensive. This is 256 bits of CSPRNG output:
-- there is nothing to guess, and a slow hash would only make every reset slower.
--
-- No foreign key, because `subject_id` points at one of two tables. The redeem
-- path re-reads the account by id, so a deleted account cannot be reset into
-- existence.
CREATE TABLE IF NOT EXISTS public.password_resets (
  token_hash text PRIMARY KEY,             -- sha256 hex of the emailed secret
  subject    text NOT NULL,                -- 'athlete' | 'coach' — which table
  subject_id integer NOT NULL,
  expires_at bigint NOT NULL               -- unix seconds; one hour out
);

-- Spent and abandoned rows are swept whenever a new reset is issued, which needs
-- this to stay a range scan rather than a table scan.
CREATE INDEX IF NOT EXISTS idx_password_resets_expires
  ON public.password_resets (expires_at);

-- Same posture as every other table: the app connects through the pooler as the
-- postgres role and bypasses RLS. This exists so no anon key can read a pending
-- reset — which, unlike a pending OAuth handshake, would be worth stealing even
-- as a hash if the hash were ever weakened.
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
