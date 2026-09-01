import crypto from "crypto";
import { one, run } from "./db/driver";
import { secret } from "./session";

/**
 * Google sign-in, as a direct OIDC authorization-code exchange.
 *
 * WHY NOT SUPABASE AUTH. `.env.example` forbids it in as many words: adding the
 * anon key opens the project's PostgREST surface, which is safe today only
 * because every table has RLS enabled with no policies. "A supabase-js path is
 * not a config change. It needs RLS policies written first." So this talks to
 * Google directly and ends by calling the session helpers that already exist —
 * `logIn()` / `athleteLogIn()`. The HMAC scheme, the cookies, `apiAuth.ts` and
 * DEPLOY.md's credential table are all untouched by this file.
 *
 * WHY NO id_token SIGNATURE CHECK, AND WHY THAT IS NOT A SHORTCUT. The token is
 * not read from the redirect. It is fetched by this server from Google's token
 * endpoint over TLS, in a request authenticated with our client secret. OIDC
 * Core 3.1.3.7 says signature validation MAY be skipped for exactly that case,
 * because TLS already establishes who sent it. Reading an id_token out of a URL
 * fragment — the implicit flow — is the case that requires JWKS verification,
 * and this is not that. It also means no new crypto dependency.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type Role = "coach" | "athlete";

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * The `state`, which is what stops a stranger deciding whose browser gets
 * signed in.
 *
 * The Strava handshake this is modelled on protected an athlete's row, because
 * the caller was already authenticated and the callback wrote onto the id the
 * state named. Nothing is authenticated here, so the attack is the other
 * direction: without a state, an attacker completes their own Google consent,
 * saves the resulting callback URL, and gets a victim to open it — the victim's
 * browser silently ends up holding a session for the ATTACKER's account, and
 * anything the victim then enters is written into a stranger's record.
 *
 * Three properties close that, and all three are needed:
 *   - unguessable, so it cannot be fabricated (32 random bytes, full-length
 *     HMAC, compared with timingSafeEqual);
 *   - short-lived, so a leaked one is worth nothing for long (10 minutes, which
 *     is generous for one redirect chain);
 *   - single use, which no self-contained token can express — the row below is
 *     the server's memory that this one was spent.
 */
const STATE_TTL_S = 600;

function stateSig(iat: number, nonce: string): string {
  return crypto.createHmac("sha256", secret()).update(`google:${iat}:${nonce}`).digest("hex");
}

/** Record a pending handshake; returns the `state` and the PKCE challenge. */
export async function issueState(
  role: Role
): Promise<{ state: string; codeChallenge: string }> {
  const iat = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(32).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

  // Abandoned handshakes would otherwise accumulate forever; sweeping here keeps
  // the table the size of what is actually in flight without a scheduled job.
  await run("DELETE FROM google_oauth_states WHERE expires_at <= ?", [iat]);
  await run(
    "INSERT INTO google_oauth_states (nonce, role, code_verifier, expires_at) VALUES (?, ?, ?, ?)",
    [nonce, role, codeVerifier, iat + STATE_TTL_S]
  );
  return { state: `${iat}.${nonce}.${stateSig(iat, nonce)}`, codeChallenge };
}

/**
 * Redeem a `state`. Returns the door it was issued for and its PKCE verifier,
 * or null — and consumes it, so a second call with the same value returns null.
 */
export async function verifyState(
  state: string
): Promise<{ role: Role; codeVerifier: string } | null> {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [rawIat, nonce, sig] = parts;
  const iat = Number(rawIat);
  if (!Number.isInteger(iat)) return null;

  const expected = stateSig(iat, nonce);
  try {
    // Throws on a length mismatch, which is why it is inside the try — an
    // attacker-supplied sig is any length at all.
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (iat > now + 60 || now - iat > STATE_TTL_S) return null;

  // Read and consume in one statement. Two concurrent replays both reach this
  // line; only one DELETE can match a given row, so only one gets a row back.
  const row = await one<{ role: string; code_verifier: string }>(
    "DELETE FROM google_oauth_states WHERE nonce = ? AND expires_at > ? RETURNING role, code_verifier",
    [nonce, now]
  );
  if (!row) return null;
  if (row.role !== "coach" && row.role !== "athlete") return null;
  return { role: row.role, codeVerifier: row.code_verifier };
}

/**
 * The redirect target, which must byte-match what is registered in the Google
 * console or the exchange is refused.
 *
 * Taken from configuration, NEVER from the incoming request. Deriving an origin
 * from the Host header hands anyone who can set that header the power to move
 * where the authorization code is delivered. Same source as layout.tsx's
 * SITE_URL, with the same localhost fallback for dev.
 */
export function redirectUri(): string {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${origin.replace(/\/$/, "")}/api/auth/google/callback`;
}

export async function authorizeUrl(role: Role): Promise<string> {
  const { state, codeChallenge } = await issueState(role);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: "openid email",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    // Google returns no refresh token and prompts only when it has to. We want
    // neither — this is a sign-in, not a data grant; the session is ours.
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params}`;
}

/**
 * Exchange the code and return the verified email address, lowercased.
 *
 * Returns null rather than throwing for every failure mode a caller can do
 * nothing about — a stale code, a wrong verifier, an unverified Google account.
 * The caller turns that into one indistinguishable redirect, so the flow leaks
 * nothing about which accounts exist.
 */
export async function emailFromCode(
  code: string,
  codeVerifier: string
): Promise<string | null> {
  return exchange(
    {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    },
    process.env.GOOGLE_CLIENT_ID
  );
}

export function googleNativeConfigured(): boolean {
  return Boolean(process.env.GOOGLE_IOS_CLIENT_ID);
}

/**
 * The same exchange for the iOS app, which authorizes against its own Google
 * client and posts the resulting code here.
 *
 * NO CLIENT SECRET, and that is correct rather than a gap. Google's iOS clients
 * are *public* clients: the secret would have to ship inside the app binary,
 * where it is not a secret, so Google does not issue one. PKCE is what
 * authenticates this exchange — only the party that generated `code_verifier`
 * can redeem the code, and that verifier never left the device until this
 * request.
 *
 * WHY THE EXCHANGE HAPPENS HERE AND NOT ON THE PHONE. This is the whole reason
 * the app posts a code rather than an id_token. A token this server fetched
 * itself, over TLS, from Google's token endpoint needs no signature check (see
 * the note at the top of this file). An id_token handed to us by a client is an
 * attacker-supplied string, and trusting one without full JWKS verification is
 * the classic way these integrations are broken into.
 *
 * `redirectUri` is the app's, not the website's, and must byte-match what the
 * app sent — Google checks it even for public clients.
 */
export async function emailFromNativeCode(
  code: string,
  codeVerifier: string,
  appRedirectUri: string
): Promise<string | null> {
  if (!process.env.GOOGLE_IOS_CLIENT_ID) return null;
  return exchange(
    {
      code,
      client_id: process.env.GOOGLE_IOS_CLIENT_ID,
      redirect_uri: appRedirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    },
    process.env.GOOGLE_IOS_CLIENT_ID
  );
}

/** Redeem a code and validate the id_token that comes back. */
async function exchange(
  form: Record<string, string>,
  expectedAud: string | undefined
): Promise<string | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  }).catch(() => null);
  if (!res || !res.ok) return null;

  const body = (await res.json().catch(() => null)) as { id_token?: string } | null;
  if (!body?.id_token) return null;

  const claims = decodeIdToken(body.id_token);
  if (!claims) return null;

  // An unverified address is a claim, not an identity — Google will hand one
  // out for an address the signer never proved they control, and matching on it
  // would let anyone sign in as any coach whose email they know.
  if (claims.email_verified !== true || typeof claims.email !== "string") return null;

  // Audience and issuer. Belt and braces given the token came back from our own
  // authenticated request to Google, but these are the two claims that say who
  // minted this token and who it was minted for, and checking them costs two
  // lines. Google issues `iss` both with and without the scheme.
  //
  // `expectedAud` is per-client on purpose: the web and iOS clients are
  // different audiences, and accepting either here would let a code minted for
  // one be redeemed through the other's door.
  if (!expectedAud || claims.aud !== expectedAud) return null;
  if (claims.iss !== "accounts.google.com" && claims.iss !== "https://accounts.google.com") {
    return null;
  }
  // Freshly minted a moment ago by definition, so this only ever catches
  // something being badly wrong. Cheap enough to keep.
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;

  return claims.email.trim().toLowerCase();
}

type IdTokenClaims = {
  email?: unknown;
  email_verified?: unknown;
  aud?: unknown;
  iss?: unknown;
  exp?: unknown;
};

/** Read the payload. Safe without signature checks only because of where the
 *  token came from — see the note at the top of this file. */
function decodeIdToken(token: string): IdTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as IdTokenClaims;
  } catch {
    return null;
  }
}
