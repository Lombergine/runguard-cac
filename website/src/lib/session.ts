import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE = "mm_session";

/**
 * True where the app is reachable as a deployment rather than as local dev.
 * The same signal `secret()` fails closed on, reused so the two cannot drift:
 * where a public dev secret would be unsafe, plain HTTP is unsafe too.
 *
 * It gates `secure` rather than hardcoding `true` because a `secure` cookie is
 * simply not stored over http://localhost, which would break local dev sign-in.
 */
function deployed(): boolean {
  return process.env.DB_DRIVER === "supabase" || process.env.NODE_ENV === "production";
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

/* ---- coach session: signed, carries the team id ---- */

function signTeam(teamId: number): string {
  const sig = crypto.createHmac("sha256", secret()).update(`coach:${teamId}`).digest("hex");
  return `${teamId}.${sig}`;
}

/**
 * Returns the team id if the cookie value is a valid coach session, else null.
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
function verifyCoachCookie(value: string | undefined): number | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 0) return null;
  const teamId = Number(value.slice(0, dot));
  if (!Number.isInteger(teamId)) return null;
  const expected = signTeam(teamId);
  try {
    if (crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected))) return teamId;
  } catch {
    return null;
  }
  return null;
}

export async function isLoggedIn(): Promise<boolean> {
  const store = await cookies();
  return verifyCoachCookie(store.get(COOKIE)?.value) !== null;
}

export async function currentTeamId(): Promise<number | null> {
  const store = await cookies();
  return verifyCoachCookie(store.get(COOKIE)?.value);
}

export async function logIn(teamId: number): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, signTeam(teamId), {
    httpOnly: true,
    secure: deployed(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function logOut(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/* ---- athlete web session (their device/app token in an httpOnly cookie) ---- */

const ATHLETE_COOKIE = "core_athlete";

/**
 * The value is the raw device_token, deliberately. Unlike the coach cookie —
 * whose payload is a guessable integer team id and so must be signed to stop
 * anyone editing it into another team's — this cookie carries a secret that is
 * checked against the database by `getAthleteByToken`. A signature would add
 * nothing an attacker could not already bypass: forging the cookie still
 * requires knowing a real device token, and knowing one already authenticates
 * via `Authorization: Bearer`. What actually protects it is httpOnly (no JS
 * read) plus `secure` (no plaintext transmission), both set here.
 */
export async function athleteLogIn(token: string): Promise<void> {
  const store = await cookies();
  store.set(ATHLETE_COOKIE, token, {
    httpOnly: true,
    secure: deployed(),
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
