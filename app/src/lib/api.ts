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
  PrePractice,
  Profile,
  ProfileWithNextRace,
  RaceFeel,
  ServerFlag,
  WorkoutStatus,
} from "./types";
import { getCredential, type Role } from "./auth";
import { isDemo, recordWrite } from "./demo";

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
 * Never carries the session token, in the message or anywhere else.
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
 * 401 is distinct from every other failure: the session token is missing, wrong,
 * expired, or belongs to a deleted athlete. It is not retryable and it is not a
 * network blip — the athlete has to sign in again. Surfaces must FAIL CLOSED on
 * it, showing what is unavailable rather than partial data.
 */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  /**
   * Which credential authenticates this route. Defaults to the athlete's
   * session token, which is what every route above the coach section takes.
   *
   * It is declared per route rather than inferred from whatever is in the
   * keychain, so this module never GUESSES which Bearer to send. Only one
   * credential exists at a time (`lib/auth.ts`), so a mismatch means a screen
   * outlived its session — a coach tab still mounted a frame after an athlete
   * signed in, say. That is a 401 here rather than a request, because sending
   * the wrong role's token is how a stale screen ends up authenticating as
   * whoever is holding the phone now.
   */
  as?: Role;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const role: Role = opts.as ?? "athlete";
  const credential = await getCredential();
  // Fail closed rather than sending an unauthenticated request and letting the
  // caller interpret whatever comes back.
  if (!credential || credential.role !== role) {
    throw new ApiError(
      401,
      role === "coach"
        ? "This device is not signed in as a coach."
        : "This device is not signed in. Sign in first."
    );
  }

  /*
   * In the demo, a write never leaves the phone.
   *
   * This is the only place it can be done once: every mutating call in this
   * module goes through `request()` with a method, so there is no second door
   * and no route added later that forgets. The write is recorded locally
   * (lib/demo.ts) and resolves as though the server had accepted it, because
   * the alternative — a demo where tapping "Good" throws — is a demo of nothing.
   *
   * The server refuses these too, independently: `demoAthlete.ts` makes the demo
   * athlete unresolvable for any non-GET. That is the guarantee; this is the
   * part that keeps the demo usable. READS still go to the network, so the demo
   * shows the real seeded athlete rather than a fixture.
   */
  const method = opts.method ?? "GET";
  if (isDemo() && method !== "GET") {
    recordWrite(path, opts.body);
    return undefined as T;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${credential.token}`,
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
 * ── IT STAYS, THOUGH THE SERVER NO LONGER SENDS ONE ─────────────────────────
 *
 * `athletes.device_token` has been removed: the athlete now authenticates with a
 * session token from a password sign-in, and /api/mobile/me and /api/mobile/home
 * have nothing of the kind left to put in the payload. Deleting this function
 * would therefore be safe — as long as that stays true of every response, on
 * every deployment, forever. That is trusting a payload SHAPE, which is the one
 * thing this module has always refused to do; a `delete` on a key that is not
 * there costs a property lookup and cannot fail.
 *
 * So it is a belt-and-braces guard now rather than a live strip. It keeps
 * working if an older server is still answering this build, if the column comes
 * back under its old name, or if `buildProfile()` — which the coach dashboard
 * shares — ever hands the phone a credential field again.
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
 * same timeout, the same token-free errors — and the same belt-and-braces strip.
 */
export async function getHome(): Promise<ProfileWithNextRace> {
  return stripDeviceToken(await request<ProfileWithNextRace>("/api/mobile/home"));
}

/**
 * GET /api/mobile/demo — a session token for the demo runner.
 *
 * Issues its own fetch rather than going through `request()`, for the same
 * reason `login.tsx` does: `request()` reads a token out of the Keychain and
 * refuses without one, and the entire point here is to obtain the first one.
 *
 * The token is handed straight to `setToken` by the caller and then dropped. It
 * is never rendered and never logged, exactly like the one a password sign-in
 * returns — it is the same kind of value, for a seeded athlete rather than for
 * the person holding the phone. `name` comes back so the demo can say whose data
 * it is showing, which matters: this is a real seeded athlete's record, not a
 * fixture.
 *
 * 404 means the demo is switched off on this server (`DEMO_TEAM_ID` unset), and
 * is deliberately indistinguishable from a route that was never built.
 */
export async function getDemoPairing(): Promise<{ token: string; name: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/mobile/demo`, { signal: controller.signal });
  } catch {
    throw new ApiError(0, `Could not reach the RunGuard server at ${BASE_URL}.`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) {
    throw new ApiError(404, "The demo is not available on this server.");
  }
  if (!res.ok) throw new ApiError(res.status, `The demo could not be opened (${res.status}).`);

  const body = (await res.json().catch(() => null)) as
    | { token?: unknown; name?: unknown }
    | null;
  const token = typeof body?.token === "string" ? body.token : null;
  if (!token) throw new ApiError(500, "The demo sent nothing this app can use.");

  return { token, name: typeof body?.name === "string" ? body.name : "the demo runner" };
}

/**
 * GET /api/mobile/demo/coach — a coach token for the demo team.
 *
 * The coach half of the route above, and it exists for the same reason: its own
 * `fetch`, because `request()` refuses without a credential and the point here
 * is to obtain the first one.
 *
 * WHAT COMES BACK is a real coach credential for a real team — strictly more
 * than the athlete demo hands out, since it opens a whole roster. Two things
 * make that safe, and only one of them is in this file. The server refuses any
 * non-GET for the demo team at the single point where a coach request becomes a
 * team id (`resolveCoachTeam`), so the calendar cannot be written from here by
 * this app or by anything else. And the demo team must contain only seeded
 * data — a standing condition stated in `website/src/lib/demo.ts` that nothing
 * in code can check.
 *
 * `name` is the TEAM's, so the demo can say whose roster it is showing. It is
 * nullable on the wire; the caller supplies its own words rather than printing
 * an empty string.
 *
 * 404 means the demo is switched off on this server (`DEMO_TEAM_ID` unset), and
 * is deliberately indistinguishable from a route that was never built.
 */
export async function getCoachDemoPairing(): Promise<{ token: string; name: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/mobile/demo/coach`, { signal: controller.signal });
  } catch {
    throw new ApiError(0, `Could not reach the RunGuard server at ${BASE_URL}.`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) {
    throw new ApiError(404, "The demo is not available on this server.");
  }
  if (!res.ok) throw new ApiError(res.status, `The demo could not be opened (${res.status}).`);

  const body = (await res.json().catch(() => null)) as
    | { token?: unknown; name?: unknown }
    | null;
  const token = typeof body?.token === "string" ? body.token : null;
  if (!token) throw new ApiError(500, "The demo sent nothing this app can use.");

  return { token, name: typeof body?.name === "string" ? body.name : "the demo team" };
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

/* ------------------------------------------------------------------ *
 * Coach
 * ------------------------------------------------------------------ */

/**
 * The coach half of the client. Four reads and one sign-in, all authenticated
 * by the coach token (`<teamId>.<hmac>`, `lib/auth.ts`) rather than a device
 * token, which is what `as: "coach"` on every call below selects.
 *
 * THE ROUTE HANDLERS ARE THE CONTRACT, exactly as they are for the athlete
 * calls at the top of this file:
 *   website/src/app/api/mobile/coach-login/route.ts
 *   website/src/app/api/mobile/coach/roster/route.ts
 *   website/src/app/api/mobile/coach/plan/route.ts
 *   website/src/app/api/mobile/coach/sources/route.ts
 *   website/src/app/api/mobile/coach/athlete/[id]/route.ts
 * They are being written concurrently with this module, so the types below are
 * the slice the app consumes and expects — read the handlers rather than
 * trusting these if the two ever disagree, and reconcile HERE rather than
 * casting at a call site.
 *
 * TWO THINGS THAT ARE ABSENT ON PURPOSE.
 *
 *  1. No chat, in any shape — not a message, not a placeholder, not a count.
 *     Safety-tagged exchanges must never reach a coach surface (visual-spec
 *     non-negotiable #1 and § "Coach dashboard"), and the cheapest way to
 *     guarantee it on this side is for the coach types to have nowhere to put
 *     one.
 *  2. No athlete credential of any kind. `athletes.device_token` is gone from
 *     the product, but if a roster route ever hands the phone a token field it
 *     is stripped below before any caller sees it, for the same reason
 *     `stripDeviceToken` exists — a type is not a fence.
 *
 * There is also no composite score and no risk ranking here, because there is
 * none in the product. The roster is sorted by what is MISSING, never by risk.
 */

/**
 * The team a coach token is signed for.
 *
 * `name` is nullable because the roster route sends `team?.name ?? null` — a
 * token whose team row has since been deleted still resolves, and the screen
 * has to render that as unknown rather than as a team called "undefined".
 */
export type CoachTeam = { id: number; name: string | null };

/**
 * The eight self-report scalars, exactly as `website/src/lib/risk.ts` defines
 * them. Sent whole because each roster flag needs several together — a part
 * with no day count says nothing about whether it matters.
 */
export type CoachSelfReport = {
  hasData: boolean;
  /** Worst severity reported today; 0 when nothing was reported. */
  todayMax: number;
  todayPart: string | null;
  persistentPart: string | null;
  /** Distinct days that part was reported sore, last 7. */
  persistentDays: number;
  persistentPeak: number;
  escalating: boolean;
  /** Days since ANY check-in. `null` is never, which is not the same as 0. */
  daysSinceReport: number | null;
};

/** A run well past the athlete's own recent longest. Null when unremarkable. */
export type CoachSpike = {
  /** KILOMETRES. Convert through lib/units before display. */
  km: number;
  longestKm: number;
  pctAbove: number;
  level: "notable" | "large";
};

/**
 * One roster row.
 *
 * NOTE there is deliberately no `risk.score` here, and adding one would be a
 * regression rather than a feature: the coach dashboard records that a ranked
 * injury number taught athletes to inflate their check-ins. `zone` is the
 * coarse state a coach acts on; `readiness` is the athlete's own number, which
 * they can already see on their own phone.
 */
export type CoachRosterAthlete = {
  id: number;
  name: string;
  grade: number | null;
  /** Avatar hue, 0-360. Colour only ever decorates here, never informs. */
  hue: number | null;
  readiness: number;
  fitnessTier: string;
  /**
   * The coach-facing wording only. The server withholds `athleteReason` — the
   * same observation phrased for the athlete's own screen — because sending it
   * here invites it to be read out as if it were addressed to the coach.
   */
  prePractice: { flag: ServerFlag; reason: string };
  risk: {
    zone: "ready" | "caution" | "high";
    zoneLabel: string;
    /** False means no runs at all. Everything below is then unknown, not zero. */
    hasActivityHistory: boolean;
    /** KILOMETRES, last 7 days. */
    weekKm: number;
    prevWeekKm: number;
    /** Null until there is enough history — "we don't know", never a zero. */
    acwr: number | null;
    lastActivity: string | null;
  };
  selfReport: CoachSelfReport;
  spike: CoachSpike | null;
};

export type CoachRoster = {
  /**
   * Always present — the route builds it from the token's own team id, so it
   * cannot be missing. Only its `name` can be unknown.
   */
  team: CoachTeam;
  athletes: CoachRosterAthlete[];
};

/**
 * One WRITTEN day of the team calendar.
 *
 * Only days the coach actually planned are in `CoachPlan.days`; the route
 * filters the rest out. So a date absent from the array is UNPLANNED — which is
 * not a rest day, and non-negotiable #4 makes them different objects. The grid
 * has to fill its own empties dashed.
 *
 * ── UNITS: THIS ONE ROUTE IS NOT KILOMETRES ────────────────────────────────
 *
 * Everywhere else the API ships kilometres. Here the wire carries METRES on the
 * way out (`distanceM`) and MILES on the way in (`CoachPlanWrite.distanceMi`) —
 * the column is metres, and the web form has always posted the miles an American
 * high-school coach says out loud. Both directions convert in
 * `website/src/lib/teamPlan.ts`, deliberately server-side so a second client
 * cannot get it wrong. Do not hand either number to `lib/units.ts` as if it were
 * a kilometre value.
 */
export type CoachPlanDay = {
  /** YYYY-MM-DD, the team's local day. */
  date: string;
  type: string;
  /** METRES — see the units note above. Null on Rest, and on race day. */
  distanceM: number | null;
  targetPace: string | null;
  details: string | null;
  why: string | null;
  /** ISO instant. Absent from the POST echo, which sends the day back bare. */
  updatedAt?: string | null;
  /** The coach's name at the time of writing, or null. */
  updatedBy?: string | null;
};

/**
 * A week window of the calendar. No `team` — only the roster route sends one.
 *
 * `from`/`to` bound the whole window INCLUDING its unplanned days, so they are
 * what the grid iterates; `days` is the sparse set of written ones.
 */
export type CoachPlan = {
  /** How many weeks wide the window is. */
  weeks: number;
  /** First day of the window, YYYY-MM-DD. */
  from: string;
  to: string;
  days: CoachPlanDay[];
};

/**
 * The body of a calendar write.
 *
 * MILES, not kilometres and not metres — see `CoachPlanDay`. Omit or send
 * empty for a day that prescribes no distance: the server turns 0 into null
 * rather than storing a distance nobody planned.
 */
export type CoachPlanWrite = {
  date: string;
  /** Required and non-empty; the server rejects a blank with a 400. */
  type: string;
  distanceMi?: number | string | null;
  targetPace?: string | null;
  details?: string | null;
  why?: string | null;
};

/** One athlete's inbound data, for the sources screen. */
export type CoachSource = {
  id: number;
  name: string;
  grade: number | null;
  /** Avatar hue, 0-360. Decoration; it never carries state. */
  hue: number | null;
  /**
   * ISO instant of the most recent sync, or null.
   *
   * Null and `hasSynced: false` mean the same thing and the server sends both;
   * either way this is "we have never heard from this phone", which renders
   * dashed. It is NOT a zero, and it is NOT "synced a long time ago".
   */
  lastSyncAt: string | null;
  hasSynced: boolean;
};

export type CoachSources = { athletes: CoachSource[] };

/**
 * One athlete, opened from the roster.
 *
 * DERIVED FROM `Profile` on purpose. The route builds this from the same
 * `buildProfile()` the athlete's own `/api/mobile/me` uses and allow-lists the
 * fields, and the set it emits is an exact subset of `/me`'s — verified field by
 * field against the two handlers. Restating those thirty-odd fields by hand
 * meant they drifted the first time the server changed, which is what produced
 * the invented `checkedInToday` and flat `weekKm` this type used to carry.
 *
 * The eight names below are the ones a coach does not get: personal badges, the
 * athlete's own calendar and chat summary, their notification settings, and the
 * four PR/prediction/stats blocks. If the server ever starts sending one, delete
 * it from this list — do not add a parallel field.
 */
export type CoachAthleteDetail = Omit<
  Profile,
  | "badges"
  | "calendar"
  | "chatSummary"
  | "notifications"
  | "paceSeason"
  | "predictions"
  | "prs"
  | "stats"
  | "prePractice"
> & {
  /**
   * Coach wording ONLY. The route drops `athleteReason` — the same observation
   * phrased for the athlete's own screen — so it is narrowed away here rather
   * than left optional, where a screen could read it, get `undefined`, and fall
   * back to the third-person `reason`.
   */
  prePractice: Omit<PrePractice, "athleteReason">;
};

/**
 * Deletes any athlete token from a parsed coach response.
 *
 * Same argument as `stripDeviceToken` above, pointed at a list, and it stays for
 * the same reason: the column it was written against is gone, and a guard that
 * costs one property lookup per row is cheaper than trusting the shape of every
 * roster payload every deployment will ever send. Both spellings are removed —
 * the mobile routes camel-case their output, a raw row does not, and this runs
 * before any caller can hold either one.
 */
function stripRosterTokens<T>(parsed: T): T {
  const rows = (parsed as { athletes?: unknown } | null)?.athletes;
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (row && typeof row === "object") {
        delete (row as Record<string, unknown>).deviceToken;
        delete (row as Record<string, unknown>).device_token;
      }
    }
  }
  return parsed;
}

/**
 * POST /api/mobile/coach-login — email and password for `{ token }`.
 *
 * Issues its own fetch rather than going through `request()`, for the two
 * reasons `getDemoPairing` does and one more: `request()` refuses without a
 * credential and the point here is to obtain the first one, and in demo mode it
 * would swallow this POST as a pretend write and resolve with nothing.
 *
 * The token is handed to `setCoachToken` by the caller and then dropped. It is
 * never rendered, never logged, and never put in an error message — and neither
 * is the password, which is why the thrown fetch value is discarded rather than
 * reused: it can echo the request body.
 *
 * The server's own 4xx sentence reaches the coach through `ApiError.message`,
 * exactly as it does for the athlete login. There is NO dev-token equivalent of
 * `EXPO_PUBLIC_DEV_TOKEN` for this credential and there must not be one: it
 * opens a whole roster of minors' health data.
 */
export async function coachLogin(
  email: string,
  password: string
): Promise<{ token: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/mobile/coach-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, `Could not reach the RunGuard server at ${BASE_URL}.`);
  } finally {
    clearTimeout(timer);
  }

  const body = (await res.json().catch(() => null)) as
    | { token?: unknown; error?: unknown }
    | null;

  if (!res.ok) {
    const detail = typeof body?.error === "string" ? body.error : null;
    throw new ApiError(res.status, detail ?? `Request failed (${res.status}).`);
  }

  const token = typeof body?.token === "string" ? body.token : null;
  if (!token) throw new ApiError(500, "The server sent nothing this app can use.");
  return { token };
}

/** GET /api/mobile/coach/roster — every athlete on the coach's team. */
export async function getCoachRoster(): Promise<CoachRoster> {
  const roster = await request<CoachRoster>("/api/mobile/coach/roster", { as: "coach" });
  return stripRosterTokens(roster);
}

/** GET /api/mobile/coach/plan — the team calendar. */
export async function getCoachPlan(): Promise<CoachPlan> {
  return request<CoachPlan>("/api/mobile/coach/plan", { as: "coach" });
}

/** GET /api/mobile/coach/sources — what has arrived from whom, and when. */
export async function getCoachSources(): Promise<CoachSources> {
  const sources = await request<CoachSources>("/api/mobile/coach/sources", { as: "coach" });
  return stripRosterTokens(sources);
}

/**
 * GET /api/mobile/coach/athlete/{id} — one athlete in full.
 *
 * Ownership is the ROUTE's to enforce, as it is for `getActivity`: ids are
 * sequential, so the handler must confirm the athlete is on the team the coach
 * token is signed for. Nothing the app can do substitutes for that check.
 */
export async function getCoachAthlete(id: number): Promise<CoachAthleteDetail> {
  return request<CoachAthleteDetail>(`/api/mobile/coach/athlete/${id}`, {
    as: "coach",
  });
}

/**
 * POST /api/mobile/coach/plan — write one day of the team calendar.
 *
 * THE TEAM IS NOT AN ARGUMENT, and there is no field for it in `CoachPlanWrite`.
 * The route takes the team from the HMAC in the coach token and ignores the
 * body, exactly as `lib/teamPlan.ts` says both writers must: "taking a team id
 * as a parameter would invite one of them to take it from the request body".
 *
 * MILES ON THE WAY IN, METRES ON THE WAY BACK — see `CoachPlanDay`. The echoed
 * day is the stored row, so a unit mistake shows up here rather than a fortnight
 * later on an athlete's screen; the caller should render what comes back rather
 * than the values it just typed.
 *
 * ONE DAY PER CALL, matching the web writer. A bulk version would need a
 * partial-failure story, and "some of your week saved" is the shape of bug that
 * leaves a coach believing they planned a session they did not.
 *
 * Goes through `request()` rather than its own fetch, which is what makes the
 * coach demo work: `request()` records a write locally and resolves without
 * touching the network, so tapping Save in the demo does not throw. It returns
 * `undefined` there — hence the nullable echo.
 */
export async function saveCoachPlanDay(
  day: CoachPlanWrite
): Promise<{ ok: true; day: CoachPlanDay } | undefined> {
  return request<{ ok: true; day: CoachPlanDay } | undefined>("/api/mobile/coach/plan", {
    method: "POST",
    body: day,
    as: "coach",
  });
}
