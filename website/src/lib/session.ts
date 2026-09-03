import { cookies } from "next/headers";
import crypto from "crypto";
import { DEMO_COOKIE, demoTeamId } from "./demo";
import { one } from "./db/driver";

const COOKIE = "mm_session";

/**
 * True where a published default would become reachable: the app is built for
 * production, or it is pointed at a shared database. Gates `secret()` only.
 *
 * Deliberately still true for `DB_DRIVER=supabase` on localhost. Running a dev
 * server against the shared DEV project means the cookies it mints are valid
 * against rows other people can read, so the public dev secret must not stand
 * there — that is the whole point of failing closed.
 */
function deployed(): boolean {
  return process.env.DB_DRIVER === "supabase" || process.env.NODE_ENV === "production";
}

/**
 * Whether to mark cookies `secure`. A question about TRANSPORT, and nothing to
 * do with which database is in play — `npm run dev` against the shared DEV
 * project is still plain HTTP on localhost.
 *
 * This used to be `deployed()`, which meant `DB_DRIVER=supabase npm run dev`
 * marked every cookie `secure` over http and broke sign-in. Browsers disagree
 * about that case (Chrome and Firefox grant localhost an exception, Safari does
 * not), so it failed on one machine and not the next. `next dev` never sets
 * NODE_ENV=production and every deployment does, which is the line wanted.
 */
function secureCookies(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * The dev fallback is only safe while it cannot reach a deployment. This file is
 * public on GitHub, so a deployed instance running on the literal string below
 * signs its session cookies with a secret anyone can read — meaning anyone can
 * mint a valid coach cookie for any team.
 *
 * So it fails closed exactly where that becomes reachable: the moment the app is
 * pointed at a shared database (DB_DRIVER=supabase) or built for production,
 * SESSION_SECRET must be set. Locally against the SQLite file, the fallback
 * stands and nothing changes.
 */
export function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (deployed()) {
    throw new Error(
      "SESSION_SECRET is not set. Refusing to sign sessions with the public " +
        "dev default. Generate one with `openssl rand -hex 32` and set it in " +
        "Vercel → Settings → Environment Variables."
    );
  }
  return "milemarker-dev-secret";
}

/* ---- token versions: what makes a session revocable ---- */

/**
 * The account's current token generation. Bumped by a password reset, which is
 * what turns "the password changed" into "everyone else is signed out".
 *
 * Imported from ./db/driver rather than ./db to keep this file off the cycle —
 * db.ts is where the app's queries live and several of them want a session.
 *
 * Null means no such account. That is a rejection, not a zero: a token naming a
 * deleted athlete must not verify because the missing row read as version 0.
 */
async function athleteTokenVersion(athleteId: number): Promise<number | null> {
  const row = await one<{ token_version: number }>(
    "SELECT token_version FROM athletes WHERE id = ?",
    [athleteId]
  );
  return row ? Number(row.token_version) : null;
}

async function coachTokenVersion(teamId: number): Promise<number | null> {
  const row = await one<{ token_version: number }>(
    "SELECT token_version FROM teams WHERE id = ?",
    [teamId]
  );
  return row ? Number(row.token_version) : null;
}

/* ---- coach session: signed, carries the team id ---- */

/**
 * The coach credential itself:
 * `<teamId>.<version>.<HMAC(secret, "coach:<teamId>:<version>")>`.
 *
 * The version is INSIDE the signature as well as beside it, so it cannot be
 * edited in transit — carrying it in the string is only what lets the verifier
 * check the signature before it reads the database.
 *
 * Exported because the phone carries this exact value as a Bearer token
 * (`/api/mobile/coach-login` mints it, `resolveCoachTeam` in lib/apiAuth.ts
 * checks it). One scheme, one signing key, one verifier — a second coach
 * credential invented for the app would be a second thing to get wrong, and the
 * one that nobody looks at is the one that rots.
 */
export function signTeam(teamId: number, version: number): string {
  const sig = crypto
    .createHmac("sha256", secret())
    .update(`coach:${teamId}:${version}`)
    .digest("hex");
  return `${teamId}.${version}.${sig}`;
}

/**
 * Returns the team id if `value` is a valid coach session, else null.
 *
 * Named for the VALUE, not the transport: the same string is read from the
 * `mm_session` cookie on the web and from `Authorization: Bearer` on the phone,
 * and both must be judged by exactly these lines. `crypto.timingSafeEqual` is
 * not optional — the comparison is against a signature an attacker can iterate.
 *
 * A legacy branch used to live here: a cookie equal to `HMAC(secret(), "coach")`
 * was accepted as a session for team 1, from before teams had accounts. It was
 * deleted because it was a CREDENTIAL-FREE LOGIN, not merely a stale format.
 *
 * `secret()` above returns the literal `"milemarker-dev-secret"` when
 * `SESSION_SECRET` is unset — that string is published in this file, in this
 * repository. So the value of the accepted cookie was computable by anyone who
 * could read this line. An audit computed it and demonstrated the result:
 * `/dashboard` returned 200, and `GET /api/chat?athleteId=1` returned a real
 * athlete's private chat transcript. No password, no account, no token.
 *
 * Two things kept it from being an emergency and neither is a defence:
 * `secret()` throws rather than returning the default once deployed, so a
 * correctly-configured production instance was not reachable this way; and
 * nothing has *produced* this cookie since accounts landed, so the branch was
 * dead code. A dead branch that grants a session is worse than a live one,
 * because nobody exercises it and nobody notices it.
 *
 * Do not reinstate it. There is no cookie in circulation that needs it.
 */
export async function verifyCoachToken(value: string | undefined): Promise<number | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const teamId = Number(parts[0]);
  const version = Number(parts[1]);
  if (!Number.isInteger(teamId) || !Number.isInteger(version)) return null;

  // Signature FIRST, database second. The version is inside the HMAC, so a
  // forged one cannot survive this check — which means a garbage token is
  // rejected without touching the pooler. Reading the account first would let
  // anyone turn an unauthenticated endpoint into a query generator.
  const expected = signTeam(teamId, version);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  // The signature proves the token was minted by us at version N. Only the
  // account can say whether N is still current: a password reset bumps it, and
  // every token below it stops being a session.
  const current = await coachTokenVersion(teamId);
  return current !== null && current === version ? teamId : null;
}

/* ---- athlete session: signed, carries the athlete id ---- */

/**
 * The athlete credential:
 * `a.<athleteId>.<version>.<HMAC(secret, "athlete:<athleteId>:<version>")>`.
 *
 * A deliberate mirror of `signTeam` above, and it replaces `athletes.device_token`
 * — a permanent, unrevocable 40-hex string that was the entire credential for one
 * minor's health data.
 *
 * Revocation now has two levers rather than one. Rotating `SESSION_SECRET` still
 * invalidates every session everywhere, which is the blunt one; bumping this
 * athlete's `token_version` invalidates only theirs, which is what a password
 * reset does and what makes recovering a compromised account mean something.
 *
 * DOMAIN SEPARATION from the coach token is the signed string, not the shape.
 * A coach token signs `coach:<teamId>` and an athlete token signs
 * `athlete:<athleteId>`, so the same id under the same key produces different
 * signatures and neither verifier can ever accept the other's value. The `a.`
 * prefix is belt and braces on top of that: it makes the two forms
 * distinguishable to a reader and to `verifyCoachToken`'s `Number()` parse.
 */
export function signAthleteToken(athleteId: number, version: number): string {
  const sig = crypto
    .createHmac("sha256", secret())
    .update(`athlete:${athleteId}:${version}`)
    .digest("hex");
  return `a.${athleteId}.${version}.${sig}`;
}

/**
 * Returns the athlete id if `value` is a valid athlete session, else null.
 *
 * Same shape and same rules as `verifyCoachToken`: named for the VALUE rather
 * than the transport, because the identical string arrives in the `core_athlete`
 * cookie on the web and in `Authorization: Bearer` from the phone, and both must
 * be judged by exactly these lines. `crypto.timingSafeEqual` is not optional.
 *
 * Anything malformed is null — no prefix, no dot, a non-integer id, a length
 * mismatch (which makes `timingSafeEqual` throw). Re-signing the parsed id and
 * comparing the WHOLE string is what makes `Number()`'s tolerance harmless:
 * "a. 7 .<sig>" parses to 7 but can never equal `signAthleteToken(7, v)`.
 */
export async function verifyAthleteToken(value: string | undefined): Promise<number | null> {
  if (!value || !value.startsWith("a.")) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const athleteId = Number(parts[1]);
  const version = Number(parts[2]);
  if (!Number.isInteger(athleteId) || !Number.isInteger(version)) return null;

  // Signature first, database second — see verifyCoachToken.
  const expected = signAthleteToken(athleteId, version);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  const current = await athleteTokenVersion(athleteId);
  return current !== null && current === version ? athleteId : null;
}

export async function isLoggedIn(): Promise<boolean> {
  const store = await cookies();
  return (await verifyCoachToken(store.get(COOKIE)?.value)) !== null;
}

export async function currentTeamId(): Promise<number | null> {
  const store = await cookies();
  return verifyCoachToken(store.get(COOKIE)?.value);
}

export async function logIn(teamId: number): Promise<void> {
  // Minted at the account's CURRENT version, so a session issued now survives
  // until the next reset and not one bump longer.
  const version = (await coachTokenVersion(teamId)) ?? 0;
  const store = await cookies();
  // Signing in as a real coach means you are not in the demo any more. Without
  // this, a visitor who opens the sample team and then signs in — by password,
  // or now by Google — keeps `rg_demo`, and middleware refuses every write on
  // their OWN roster with a message about a demo they have already left. Only
  // logOut() used to clear it, which covered the demo → log out → sign in path
  // and none of the others. `demoLogIn` sets both cookies itself rather than
  // calling this, so it is unaffected.
  store.delete(DEMO_COOKIE);
  store.set(COOKIE, signTeam(teamId, version), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function logOut(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
  // Leaving the demo has to clear the demo marker too, or a coach who logs out,
  // creates a real team and signs in still has `rg_demo` set — and middleware
  // would refuse every write on their own roster with a message about a demo
  // they are no longer in.
  store.delete(DEMO_COOKIE);
  store.delete(ATHLETE_COOKIE);
}

/* ---- the public demo ---- */

/**
 * Open a demo session for the demo team.
 *
 * The session cookie minted here is an ORDINARY coach session — the same value
 * `logIn` would write — so every page and query that already scopes by team id
 * works unchanged and there is no second read path to keep in sync. What makes
 * it a demo is the marker cookie beside it, which middleware refuses writes on.
 *
 * The team id comes from the environment, never from the request. There is no
 * argument for a caller to get wrong and no field in the cookie to tamper with:
 * a demo session can only ever be a session for the configured demo team.
 *
 * Returns the team id it opened, or null when the demo is switched off — the
 * caller turns that into a 404 rather than a redirect, so a disabled demo is
 * indistinguishable from a route that does not exist.
 */
export async function demoLogIn(): Promise<number | null> {
  const teamId = demoTeamId();
  if (teamId === null) return null;
  const version = (await coachTokenVersion(teamId)) ?? 0;
  const store = await cookies();
  store.set(COOKIE, signTeam(teamId, version), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    // Deliberately short. A demo is a visit, not an account, and a coach who
    // comes back in a fortnight should land on the current demo rather than in
    // a stale session they have forgotten they are inside.
    maxAge: 60 * 60 * 12,
  });
  store.set(DEMO_COOKIE, "1", {
    // NOT httpOnly: the banner is a client component and reads this to know it
    // should render. It carries no secret — its whole content is the word "1",
    // and it can only ever cause more refusal, never less.
    httpOnly: false,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return teamId;
}

/**
 * Is this request inside the demo?
 *
 * Server-side and honest: it checks that the marker is present AND that the
 * session actually resolves to the configured demo team. A visitor who sets
 * `rg_demo` by hand without a session gets false here — and still gets every
 * write refused by middleware, which asks the cheaper question.
 */
export async function isDemoSession(): Promise<boolean> {
  const teamId = demoTeamId();
  if (teamId === null) return false;
  const store = await cookies();
  if (store.get(DEMO_COOKIE)?.value !== "1") return false;
  return (await verifyCoachToken(store.get(COOKIE)?.value)) === teamId;
}

/* ---- athlete web session (the same signed token, in an httpOnly cookie) ---- */

const ATHLETE_COOKIE = "core_athlete";

/**
 * The cookie carries exactly what the phone carries: `signAthleteToken(id, version)`.
 *
 * It used to hold the raw `device_token` — a second copy of a permanent secret
 * that was checked against the database on every request. It now holds a signed,
 * self-describing value that is verified by `verifyAthleteToken` with no database
 * read, so there is one athlete credential in the world instead of two places the
 * same secret could leak from. httpOnly (no JS read) and `secure` (no plaintext
 * transmission) still apply, and rotating `SESSION_SECRET` kills this cookie too.
 *
 * Takes the athlete ID, not a token string, so no caller can put a value in this
 * cookie that this file did not sign.
 */
export async function athleteLogIn(athleteId: number): Promise<void> {
  const version = (await athleteTokenVersion(athleteId)) ?? 0;
  const store = await cookies();
  // Same reason as logIn(): a real athlete signing in is out of the demo.
  store.delete(DEMO_COOKIE);
  store.set(ATHLETE_COOKIE, signAthleteToken(athleteId, version), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

export async function athleteLogOut(): Promise<void> {
  const store = await cookies();
  store.delete(ATHLETE_COOKIE);
}

export async function athleteTokenFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(ATHLETE_COOKIE)?.value ?? null;
}
