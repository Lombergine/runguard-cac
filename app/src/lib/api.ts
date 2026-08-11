/**
 * The typed HTTP client. The app never touches a database — `website/` owns the
 * only connection — so this module is the entire data boundary.
 *
 * Shapes here are keyed to the real route handlers:
 *   website/src/app/api/mobile/me/route.ts
 *   website/src/app/api/mobile/home/route.ts
 *   website/src/app/api/checkin/route.ts
 *   website/src/app/api/chat/route.ts
 * Read those rather than trusting these comments if the two ever disagree.
 */
import type { ChatMessage, Profile, ProfileWithNextRace } from "./types";
import { getToken } from "./auth";

/**
 * `localhost` is correct for the iOS Simulator, which shares the Mac's loopback.
 * On a physical phone `localhost` is the PHONE — point this at the LAN address
 * `npx expo start` prints. Static dot-path read: Expo inlines EXPO_PUBLIC_* by
 * textual substitution, so `process.env[name]` would be undefined.
 */
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

/** No health endpoint exists, so a misconfigured BASE_URL just hangs. Cap it. */
const TIMEOUT_MS = 15_000;
/** /api/chat reaches a model and declares maxDuration = 60 server-side. */
const CHAT_TIMEOUT_MS = 60_000;

/**
 * Every failure this module raises. `status` is the HTTP status, or 0 for a
 * transport failure (server down, wrong LAN address, timeout).
 *
 * Never carries the device token, in the message or anywhere else.
 */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * 401 is distinct from every other failure: the device token is missing, wrong,
 * or belongs to a deleted athlete. It is not retryable and it is not a network
 * blip — the athlete has to pair again. Surfaces must FAIL CLOSED on it, showing
 * what is unavailable rather than partial data.
 */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = await getToken();
  // Fail closed rather than sending an unauthenticated request and letting the
  // caller interpret whatever comes back.
  if (!token) throw new ApiError(401, "No device token. Pair this device first.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch {
    // The thrown value can echo the request; never re-use its message.
    throw new ApiError(0, `Could not reach the RunGuard server at ${BASE_URL}.`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res
      .json()
      .then((j: unknown) =>
        j && typeof j === "object" && typeof (j as { error?: unknown }).error === "string"
          ? (j as { error: string }).error
          : null
      )
      .catch(() => null);
    throw new ApiError(res.status, detail ?? `Request failed (${res.status}).`);
  }

  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ *
 * Profile
 * ------------------------------------------------------------------ */

/**
 * Deletes `athlete.deviceToken` from a parsed profile response.
 *
 * Both /api/mobile/me and /api/mobile/home send it, because they return
 * `buildProfile()`'s `athlete` object wholesale and the coach dashboard — which
 * shares that builder — has a legitimate use for the field. The app does not:
 * the token is the athlete's PERMANENT, non-revocable credential (lib/auth.ts),
 * for a minor, and the only place it may live is the Keychain.
 *
 * It is deleted HERE rather than merely being left out of `Profile`, because a
 * type is not a fence. The runtime object holds every key the server sent
 * whatever the declaration says, so an undeclared `deviceToken` still survives
 * any cast, any `JSON.stringify(profile)` in a log line or error report, any
 * `{...athlete}` spread into a debug view, and any `<Text>` a future edit points
 * at it. Removing the field is the only version of this that a later change
 * cannot quietly undo: a component cannot render what the object does not have.
 *
 * Mutates in place — the argument is freshly parsed JSON this module owns and
 * has not yet handed to anyone — and is applied before the value is returned,
 * so no caller ever observes the unstripped object.
 */
function stripDeviceToken<T>(parsed: T): T {
  const athlete = (parsed as { athlete?: Record<string, unknown> } | null)?.athlete;
  if (athlete && typeof athlete === "object") delete athlete.deviceToken;
  return parsed;
}

/**
 * GET /api/mobile/me — the athlete's computed profile.
 *
 * The response is the full CoreProfile plus a 60-point `series` and a `calendar`
 * of up to 366 days; `Profile` in types.ts is the slice the app consumes, and
 * the extra keys ride along unread. This is NOT a small payload — prefer
 * `getHome()` on any screen that only needs today.
 */
export async function getProfile(): Promise<Profile> {
  return stripDeviceToken(await request<Profile>("/api/mobile/me"));
}

/**
 * GET /api/mobile/home — the home screen's slice: readiness, pre-practice,
 * today's check-in and soreness, recent runs, this week's plan and its mileage
 * target, the recovery snapshot, the insight line, the notifications, and at
 * most one upcoming race. 5.3 KB against /me's 57 KB, because it omits the
 * 366-day calendar and the two long series the home screen never renders.
 *
 * Same `request()` as everything else, so it gets the same fail-closed 401, the
 * same timeout, the same token-free errors — and the same device-token strip.
 */
export async function getHome(): Promise<ProfileWithNextRace> {
  return stripDeviceToken(await request<ProfileWithNextRace>("/api/mobile/home"));
}

/* ------------------------------------------------------------------ *
 * Check-in
 * ------------------------------------------------------------------ */

/**
 * POST /api/checkin body.
 *
 * Not in types.ts (which describes server responses and component props), so it
 * is defined here — the one request shape this module owns.
 *
 * Two things the route does that the caller must know:
 *  - The date is ALWAYS server-side local (`localDay()`); you cannot send one.
 *    A phone in a different timezone from the server files under the server's
 *    day.
 *  - Exactly ONE soreness part per request. Report three sore parts with three
 *    calls.
 */
export type CheckinInput = {
  /** 1–10. Anything outside the range is stored as null, not rejected. */
  rpe?: number;
  energy?: number;
  motivation?: number;
  academicStress?: boolean;
  /** A key from lib/bodyParts. */
  sorenessPart?: string;
  /**
   * 0–10, or **null to DELETE** this part's soreness for today. Omitting
   * `sorenessSeverity` while sending a `sorenessPart` also deletes it, because
   * the route treats an out-of-range value as null.
   */
  sorenessSeverity?: number | null;
};

/** Returns `{ ok: true }`; there is nothing in it worth handing back. */
export async function postCheckin(body: CheckinInput): Promise<void> {
  await request<{ ok: true }>("/api/checkin", { method: "POST", body });
}

/* ------------------------------------------------------------------ *
 * Chat
 * ------------------------------------------------------------------ */

/**
 * The server tags safety-intercepted rows explicitly: `chatHistory` projects the
 * `engine` column out as a `safety` boolean, and POST returns one alongside the
 * reply. That tag is the ONLY thing allowed to decide whether a message renders
 * as a SafetyNotice or a ChatBubble.
 *
 * An earlier draft of this file fingerprinted the three intercept replies by
 * their opening words, because the field did not exist yet. It has been removed
 * deliberately: matching on copy means the safety routing breaks silently the
 * first time anyone rewords a reply in `website/src/lib/safety.ts`, and the one
 * component that must never be wrong would fail without a test noticing.
 *
 * If `safety` is ever missing from a response, treat it as TRUE rather than
 * false. A normal reply shown as a SafetyNotice is a cosmetic miss; a crisis
 * reply reaching ChatBubble breaks visual-spec non-negotiable #1.
 */
type ChatRow = { role: string; text: string; safety?: boolean };

function safetyOf(row: { safety?: boolean }): boolean {
  return row.safety ?? true;
}

/**
 * GET /api/chat — the last 30 messages, oldest first.
 *
 * Both halves of an intercepted exchange are tagged server-side, including the
 * athlete's own message, so no client-side back-propagation is needed.
 */
export async function getChat(): Promise<ChatMessage[]> {
  const { history } = await request<{ history: ChatRow[] }>("/api/chat");
  return history.map((row) => ({
    role: row.role === "user" ? "user" : "assistant",
    text: row.text,
    safety: safetyOf(row),
  }));
}

/**
 * POST /api/chat — send a question, get the assistant's turn back.
 *
 * When `safety` is true the athlete's own message was part of the intercepted
 * exchange too; a screen holding it optimistically should mark it.
 */
export async function postChat(q: string): Promise<ChatMessage> {
  const { reply, safety } = await request<{ reply: string; safety?: boolean }>(
    "/api/chat",
    { method: "POST", body: { message: q }, timeoutMs: CHAT_TIMEOUT_MS }
  );
  return { role: "assistant", text: reply, safety: safetyOf({ safety }) };
}
