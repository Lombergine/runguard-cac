/**
 * The typed HTTP client. The app never touches a database — `website/` owns the
 * only connection — so this module is the entire data boundary.
 *
 * Shapes here are keyed to the real route handlers:
 *   website/src/app/api/mobile/me/route.ts
 *   website/src/app/api/mobile/home/route.ts
 *   website/src/app/api/mobile/activity/[id]/route.ts
 *   website/src/app/api/checkin/route.ts
 *   website/src/app/api/chat/route.ts
 *   website/src/app/api/workout-status/route.ts
 *   website/src/app/api/race/route.ts, race/[id]/route.ts, race-result/route.ts
 * Read those rather than trusting these comments if the two ever disagree.
 *
 * ── NEVER SEND `athleteId` ──────────────────────────────────────────────────
 * Every shared (non-/api/mobile) route below opens with
 * `resolveAthlete(request, body.athleteId ?? null)`. That id is the SCOPE
 * argument: `resolveAthleteWithPath` (website/src/lib/apiAuth.ts) skips the
 * scope comparison entirely when it is null and hands back the athlete the
 * Bearer token belongs to — which is the only athlete this app may ever act as.
 *
 * So the app omits the field, always. Sending it cannot widen access — a
 * mismatch just makes the route answer 401 — but it is a value the client has
 * no business choosing, it is one typo away from locking the athlete out of
 * their own check-in, and every request body in this module is written without
 * it so that there is no template to copy the mistake from. The routes are
 * shared with the coach dashboard, which is the caller that legitimately needs
 * to name an athlete; the app is not.
 */
import type {
  ActivityDetail,
  ChatMessage,
  Profile,
  ProfileWithNextRace,
  RaceFeel,
  WorkoutStatus,
} from "./types";
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
  method?: "GET" | "POST" | "DELETE";
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
 * Profile writes
 * ------------------------------------------------------------------ */

/**
 * The three writes that change what `/me` and `/home` return.
 *
 * None of them hands anything back. Every one of these routes recomputes
 * something the caller cannot derive — membership changes `teamName`, HRmax
 * rescores every run's intensity — so the screen that made the change refetches
 * the profile rather than patching its copy. Returning the route's `{ ok, team }`
 * would invite exactly the optimistic local update that then disagrees with the
 * server.
 *
 * The server's own 4xx message is what reaches the athlete, because these routes
 * write the sentence that is actually useful — the HRmax bounds
 * (website/src/app/api/hrmax/route.ts) and "That team code doesn't match any
 * team." (website/src/app/api/athlete/join-team/route.ts). `request()` already
 * carries it through as `ApiError.message`; restating either one here is how the
 * two copies drift.
 */

/** POST /api/athlete/join-team — join by the coach's code. */
export async function joinTeam(code: string): Promise<void> {
  await request<{ ok: true }>("/api/athlete/join-team", {
    method: "POST",
    body: { joinCode: code },
  });
}

/** DELETE /api/athlete/join-team — leave the current team and go solo. */
export async function leaveTeam(): Promise<void> {
  await request<{ ok: true }>("/api/athlete/join-team", { method: "DELETE" });
}

/**
 * POST /api/hrmax — set the max heart rate, or pass **null** to clear it back to
 * automatic. The route rounds and range-checks the number itself.
 *
 * The non-finite guard is not defensive padding, it is the difference between
 * two opposite writes. `JSON.stringify({ hrMax: NaN })` emits `{"hrMax":null}`,
 * and null is the route's CLEAR signal — so a caller doing `setHrMax(Number(entry))`
 * on an unparseable text field would silently erase a measured HRmax and get
 * `{ ok: true }` for it. Refused here, before the request, with a 400 the caller
 * can show the same way it shows the server's.
 */
export async function setHrMax(value: number | null): Promise<void> {
  if (value !== null && !Number.isFinite(value)) {
    throw new ApiError(400, "Enter your max heart rate as a number.");
  }
  await request<{ ok: true }>("/api/hrmax", { method: "POST", body: { hrMax: value } });
}

/* ------------------------------------------------------------------ *
 * Check-in
 * ------------------------------------------------------------------ */

type CheckinScores = {
  /**
   * 1–10. OMITTING one leaves whatever is already stored for today alone;
   * SENDING one outside the range is a 400 ("Enter energy and RPE as a number
   * from 1 to 10.", naming every offending field), not a silent discard. Not
   * required to be a whole number — the column is REAL and holds values like
   * 5.7, so the route checks `Number.isFinite` and the range only.
   */
  rpe?: number;
  energy?: number;
  motivation?: number;
  academicStress?: boolean;
};

/**
 * The soreness half, as a UNION rather than two loose optional keys.
 *
 * A severity has no meaning without the part it describes, and the route agrees
 * in the harshest way: it reads `sorenessSeverity` only INSIDE the
 * `if (typeof body.sorenessPart === "string" && …)` branch, so a partless
 * severity is not rejected — it is silently dropped, and the route still answers
 * `{ ok: true }`. A screen that sent one would show the athlete a receipt for a
 * number the server never stored. The union makes that unsendable.
 *
 * It also makes the two legs of the pair mandatory TOGETHER, which the previous
 * pair of independent optionals did not. `{ sorenessPart }` alone used to
 * compile and, because the route then folded an out-of-range severity to null,
 * it DELETED that part's soreness. Clearing is a real operation, but it must be
 * asked for — `severity: null` — not arrived at by forgetting a field.
 *
 * Written as flat `sorenessPart` / `sorenessSeverity` keys, matching the wire,
 * rather than a nested `soreness: { part, severity }` object: nesting would read
 * better but would need an edit to every existing call site, and this module
 * does not own those files.
 */
type CheckinSoreness =
  | { sorenessPart?: undefined; sorenessSeverity?: undefined }
  | {
      /** A key from lib/bodyParts. Truncated to 60 characters server-side. */
      sorenessPart: string;
      /**
       * A WHOLE NUMBER 0–10, or **null to DELETE** this part's soreness for
       * today. Those are the only two things the route accepts. Anything else —
       * 11, -1, 4.5 — is a 400 ("Soreness severity must be a whole number from
       * 0 to 10, or null to clear it."), which arrives as `ApiError.message`.
       *
       * It did NOT used to be: an out-of-range value was folded to null and
       * silently deleted the score. The route now refuses it, so clearing is
       * something a caller has to ask for rather than fall into.
       */
      sorenessSeverity: number | null;
    };

/**
 * POST /api/checkin body.
 *
 * Not in types.ts (which describes server responses and component props), so it
 * is defined here — the request shapes this module owns.
 *
 * Two things the route does that the caller must know:
 *  - The date is ALWAYS server-side local (`localDay()`); you cannot send one.
 *    A phone in a different timezone from the server files under the server's
 *    day.
 *  - Exactly ONE soreness part per request. Report three sore parts with three
 *    calls. The two halves are independent: a soreness-only call does not touch
 *    the scores, and an omitted score keeps the value already stored for today
 *    (`COALESCE(excluded.x, checkins.x)`, website/src/lib/db.ts:420). Send them
 *    in separate calls, in either order. The corollary is that a score cannot
 *    be UN-set — there is no clear signal for rpe, energy, motivation or
 *    academicStress the way `null` clears a soreness.
 *
 * An empty body is a 400 ("Nothing to record — send a score, or a soreness part
 * and severity."). The route no longer manufactures a `checkins` row for a
 * request that reported nothing, because a row EXISTING is not the athlete
 * having answered — that empty row is how "Readiness 100/100 · Good to go" once
 * appeared over three tiles reading "Not recorded".
 */
export type CheckinInput = CheckinScores & CheckinSoreness;

/**
 * Returns `{ ok: true }`; there is nothing in it worth handing back.
 *
 * The non-finite severity guard is the same trap `setHrMax` documents, pointed
 * at a different destructive write: `JSON.stringify({ sorenessSeverity: NaN })`
 * emits `null`, and null is this route's CLEAR signal. So
 * `postCheckin({ sorenessPart: p, sorenessSeverity: Number(field) })` over an
 * unparseable entry would wipe that part's soreness and report success. Refused
 * before the request, with a 400 the caller shows exactly like the server's.
 */
export async function postCheckin(body: CheckinInput): Promise<void> {
  const severity = body.sorenessSeverity;
  if (severity !== undefined && severity !== null && !Number.isFinite(severity)) {
    throw new ApiError(400, "Enter how sore that area is as a number from 0 to 10.");
  }
  await request<{ ok: true }>("/api/checkin", { method: "POST", body });
}

/* ------------------------------------------------------------------ *
 * Plan
 * ------------------------------------------------------------------ */

/**
 * POST /api/workout-status — mark one planned day done, modified or skipped,
 * or pass **null** to clear the mark (the route DELETEs the row).
 *
 * Clearing is not skipping. `null` returns the day to "not marked", which is
 * what `PlanDay.status: null` means everywhere else; "skipped" is a thing the
 * athlete told us. Do not offer one as a way of expressing the other.
 *
 * `date` IS the client's to send here, unlike the check-in's — the athlete is
 * marking a day of the plan, which may not be today. It must be YYYY-MM-DD;
 * `PlanDay.date` already is, so pass it straight through rather than formatting
 * one. The route takes the first 10 characters, then 400s if what is left does
 * not match the pattern, and 400s the same way on a status that is not one of
 * the three words or null. Both messages are the server's and arrive as
 * `ApiError.message`.
 *
 * Hands nothing back, for the reason the profile writes do: the marked day
 * changes the plan the next fetch returns.
 */
export async function setWorkoutStatus(
  date: string,
  status: WorkoutStatus | null
): Promise<void> {
  await request<{ ok: true }>("/api/workout-status", {
    method: "POST",
    body: { date, status },
  });
}

/* ------------------------------------------------------------------ *
 * Races
 * ------------------------------------------------------------------ */

/** POST /api/race body. */
export type RaceInput = {
  /** The meet's name. Truncated to 120 characters server-side. */
  name: string;
  /**
   * YYYY-MM-DD, and NOT in the past. The route compares against ITS OWN
   * `localDay()`, so an athlete a day ahead of the server can have a date that
   * looks like tomorrow to them rejected as past. Show the server's sentence
   * rather than pre-judging the date on the phone.
   */
  date: string;
  /** The distance contested, e.g. "5K". Truncated to 20 characters. */
  event: string;
  /** METRES, and must be > 0. */
  distanceM: number;
  /** Truncated to 120 characters. */
  location?: string;
  /**
   * Gun time as 24-hour "HH:MM". Anything else is a 400 with its own sentence
   * ("Start time must look like 09:30 or 16:05.") — the route validates rather
   * than coercing, so a half-typed time is refused, not silently dropped.
   */
  startTime?: string;
  /** One of exactly: "Track" | "Cross country" | "Road" | "Trail". */
  courseType?: RaceCourseType;
  /**
   * How much this one matters: "A" | "B" | "C". A races are the ones the taper
   * is built around; C races are training efforts.
   */
  priority?: RacePriority;
  /** Free text. Truncated to 1000 characters. */
  notes?: string;
};

/** The four course types the route accepts. Anything else is a 400. */
export const RACE_COURSE_TYPES = ["Track", "Cross country", "Road", "Trail"] as const;
export type RaceCourseType = (typeof RACE_COURSE_TYPES)[number];

/** The three priorities the route accepts. */
export const RACE_PRIORITIES = ["A", "B", "C"] as const;
export type RacePriority = (typeof RACE_PRIORITIES)[number];

/**
 * POST /api/race — add a race to the athlete's own calendar.
 *
 * Every rejection here is a sentence written for a person, and each one names
 * the field: "Please fill in: race name, distance." for a missing or
 * non-positive value, "That race date is in the past — pick an upcoming date."
 * for the date. `request()` lifts the body's `error` string onto
 * `ApiError.message`, so a form shows `err.message` verbatim — do not restate
 * these checks in the client, or the form and the server will disagree about
 * which one is true.
 *
 * The route replies `{ ok: true, race }` with the inserted row. Discarded on
 * purpose: the races screen refetches, because the new race needs `daysUntil`,
 * `pacing`, `predicted` and `canEdit` computed alongside every other race, and
 * `race` carries none of them.
 */
export async function createRace(input: RaceInput): Promise<void> {
  await request<{ ok: true }>("/api/race", { method: "POST", body: input });
}

/**
 * DELETE /api/race/{id} — remove a race the athlete created.
 *
 * Sends no body: the route's `request.json().catch(() => ({}))` treats an empty
 * one as `{}`, which is exactly the athleteId-free scope this app wants.
 *
 * **403, not 404**, when the race is not the athlete's — coach- and seed-created
 * races are on the athlete's calendar but not theirs to delete, which is what
 * `UpcomingRace.canEdit` is false for. Gate the button on `canEdit` so the
 * refusal is not the first the athlete hears of it, and surface the server's
 * "Not found or not yours to delete" if one gets through anyway.
 */
export async function deleteRace(raceId: number): Promise<void> {
  await request<{ ok: true }>(`/api/race/${raceId}`, { method: "DELETE" });
}

/** POST /api/race-result body. */
export type RaceResultInput = {
  /** e.g. "5K". Truncated to 20 characters server-side. */
  event: string;
  /**
   * Seconds, STRICTLY between 30 and 7200 — the route tests `> 30 && < 7200`,
   * so 30 and 7200 exactly are both rejected, and both ends are exclusive.
   */
  timeS: number;
  /** YYYY-MM-DD. Omitted, the route files it under its own local today. */
  date?: string;
  /** Finishing position — a whole number, 1 or greater. */
  place?: number;
  /** How it felt. Anything outside these three words is a 400. */
  feel?: RaceFeel;
  /**
   * Free text, e.g. "cold, windy". Truncated to 120 characters. An empty or
   * all-whitespace string is stored as NULL — "not reported", not a blank
   * answer — so there is no need to strip one before sending.
   */
  conditions?: string;
  /**
   * Per-lap times in SECONDS — not cumulative, and not a string.
   *
   * The column has existed since first release and nothing but the seeder ever
   * wrote it. The route now checks three things and each is its own 400: every
   * entry a finite number in (0, 3600]; at most 60 of them; and the SUM within
   * 10% of `timeS`. That last one catches the common mistake of entering a
   * running total instead of individual laps, which would otherwise store a
   * plausible-looking set of splits that describe a different race.
   *
   * An empty array is stored as NULL — "none reported" — so there is no need to
   * omit the field when the athlete typed nothing.
   */
  splits?: number[];
  /** Free text about how it went. Truncated to 1000 characters. */
  notes?: string;
};

/**
 * POST /api/race-result — log a finished race.
 *
 * EVERY optional field is now validated rather than coerced: a `date` that is
 * not YYYY-MM-DD, a `place` that is not a whole number ≥ 1, a `feel` outside
 * the three words and a non-string `conditions` are each their own 400 with
 * their own sentence, which arrives as `ApiError.message`. They used to be
 * folded to null — or, for `date`, silently refiled under TODAY — behind an
 * `{ ok: true }`. Do not re-check them here: the server's message is the one
 * that should reach the athlete, and a second copy is how the two drift.
 *
 * `timeS` is the exception worth designing around. A non-number, a NaN (which
 * `JSON.stringify` sends as null) and a 4-hour marathon all land on the single
 * sentence "Need event and timeS (seconds)", so a form should say what the
 * bounds ARE next to the field rather than rely on the rejection to explain.
 *
 * Appends a row every time — there is no upsert and no id to update. Two taps
 * are two results, so the caller must not retry blind on a timeout.
 */
export async function logRaceResult(input: RaceResultInput): Promise<void> {
  await request<{ ok: true }>("/api/race-result", { method: "POST", body: input });
}

/* ------------------------------------------------------------------ *
 * Activity
 * ------------------------------------------------------------------ */

/**
 * GET /api/mobile/activity/{id} — one run in full.
 *
 * The route is the contract; `ActivityDetail` in types.ts records what this
 * module expects of it and why. It did not exist when this was written.
 *
 * Ownership is the ROUTE's to enforce, exactly as the web detail page does
 * (`activity.athlete_id !== athlete.id` → notFound): ids are sequential, so
 * anything less hands every athlete every other athlete's runs. Nothing the app
 * can do substitutes for that check.
 *
 * No `stripDeviceToken` — this payload has no `athlete` object to carry one.
 */
export async function getActivity(id: number): Promise<ActivityDetail> {
  return request<ActivityDetail>(`/api/mobile/activity/${id}`);
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
