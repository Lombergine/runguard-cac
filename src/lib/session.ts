import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE = "mm_session";

function secret(): string {
  return process.env.SESSION_SECRET || "milemarker-dev-secret";
}

/* ---- coach session: signed, carries the team id ---- */

function signTeam(teamId: number): string {
  const sig = crypto.createHmac("sha256", secret()).update(`coach:${teamId}`).digest("hex");
  return `${teamId}.${sig}`;
}

/** Returns the team id if the cookie value is a valid coach session, else null. */
function verifyCoachCookie(value: string | undefined): number | null {
  if (!value) return null;
  // legacy single-team cookie (pre-accounts): treat as demo team 1
  if (value === crypto.createHmac("sha256", secret()).update("coach").digest("hex")) return 1;
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

export async function athleteLogIn(token: string): Promise<void> {
  const store = await cookies();
  store.set(ATHLETE_COOKIE, token, {
    httpOnly: true,
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
