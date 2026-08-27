/**
 * Login rate limiting.
 *
 * WHY DB-BACKED AND NOT A MODULE-LEVEL Map. The deployment target is serverless
 * (Vercel + the Supabase pooler — see db/driver.ts). Every lambda instance gets
 * its own module scope, so an in-memory counter caps an attacker at
 * `limit x concurrent instances` and the platform decides the multiplier. A
 * limiter whose real threshold is set by autoscaling is not a limiter, so the
 * counter lives in the database both drivers already talk to. The cost is two
 * round trips on the login path, which only failed logins pay twice.
 *
 * TWO BUCKETS, and the pairing is the point:
 *
 *   pair:<ip>|<identifier>  tight  — the actual guessing gate.
 *   ip:<ip>                 loose  — catches one host spraying many accounts.
 *
 * There is deliberately NO global per-identifier bucket. A counter keyed on the
 * account alone is an account-lockout weapon: an attacker with a botnet types
 * six wrong passwords at a victim and the victim is locked out of their own
 * account, from their own laptop. Scoping the account counter to the IP means a
 * guessing attempt only ever costs the attacker their own IP's budget. In the
 * other direction, the tight limit is per (IP, account) rather than per IP, so
 * one student guessing at a teammate's password on the school's shared NAT
 * address does not lock the rest of the school out of the loose bucket — they
 * would have to burn 40 failures across distinct accounts to manage that, which
 * is far above what a hall full of typos produces in fifteen minutes.
 *
 * Only FAILURES are counted. Successful logins are free, so a busy shared
 * address is never throttled for being busy.
 *
 * FAILS OPEN. If the limiter itself throws, login still works. A rate limiter
 * that can take authentication offline is a bigger outage than the attack it
 * prevents — but every such failure is logged, because a silently disabled
 * limiter is indistinguishable from one that was never built.
 */
import { run, all } from "./db/driver";

const WINDOW_MS = 15 * 60 * 1000;
/** Failures allowed per (IP, account) pair per window. */
const PAIR_MAX = 6;
/** Failures allowed per IP across all accounts per window. */
const IP_MAX = 40;

export type LimitDecision = { allowed: true } | { allowed: false; retryAfter: number };

/** SQLite's datetime('now') text format, so both drivers sort timestamps alike. */
function stamp(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

function parseStamp(s: string): number {
  return Date.parse(s.replace(" ", "T") + "Z");
}

/**
 * The client address, taken from the header the nearest trusted proxy wrote.
 *
 * `x-forwarded-for` is a client-controllable list — anything to the left of the
 * proxy's own entry was supplied by the caller, so reading the leftmost entry
 * would hand an attacker an unlimited supply of fresh buckets by rotating a
 * header. The last entry is the one appended by the proxy in front of us.
 * Vercel's platform-set `x-vercel-forwarded-for` is preferred because it cannot
 * be spoofed at all.
 *
 * With no proxy headers at all (local dev, direct connections) every caller
 * shares the "unknown" bucket. That errs toward limiting too much rather than
 * too little, which is the correct direction to be wrong in.
 */
function clientIp(request: Request): string {
  const h = request.headers;
  const vercel = h.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim().slice(0, 64) || "unknown";
  const real = h.get("x-real-ip");
  if (real) return real.trim().slice(0, 64) || "unknown";
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",");
    const last = parts[parts.length - 1].trim();
    if (last) return last.slice(0, 64);
  }
  return "unknown";
}

function keys(request: Request, identifier: string): { ip: string; pair: string } {
  const ip = clientIp(request);
  const id = identifier.trim().toLowerCase().slice(0, 200);
  return { ip: `ip:${ip}`, pair: `pair:${ip}|${id}` };
}

/**
 * Create the counter table on first use.
 *
 * schema.sqlite.ts builds the app schema for the SQLite file only, and the
 * Supabase schema is applied once from supabase/migrations/ precisely so that
 * concurrent instances do not race the DDL. This one table is created at
 * runtime instead because it is the only way for a limiter to be self-contained
 * across both drivers, and the race is benign: `IF NOT EXISTS` is idempotent,
 * and if two instances collide Postgres raises a duplicate-key error that this
 * limiter treats like any other fault — fail open, log, retry next request. A
 * migration file is the tidier home for it if this ever grows a second caller.
 */
let ready: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await run(
        `CREATE TABLE IF NOT EXISTS auth_attempts (
           bucket TEXT NOT NULL,
           at TEXT NOT NULL
         )`
      );
      await run("CREATE INDEX IF NOT EXISTS idx_auth_attempts ON auth_attempts(bucket, at)");
    })().catch((e) => {
      // Do not memoize a failure: a transient DB blip must not disable the
      // limiter for the life of the process.
      ready = null;
      throw e;
    });
  }
  return ready;
}

/** How many attempts each bucket holds inside the window, and the oldest one. */
type Tally = { n: number; oldest: number };

async function tally(buckets: string[], now: number): Promise<Map<string, Tally>> {
  const placeholders = buckets.map(() => "?").join(", ");
  const rows = await all<{ bucket: string; n: number | string; oldest: string }>(
    `SELECT bucket, COUNT(*) AS n, MIN(at) AS oldest
       FROM auth_attempts
      WHERE at >= ? AND bucket IN (${placeholders})
      GROUP BY bucket`,
    [stamp(now - WINDOW_MS), ...buckets]
  );
  return new Map(rows.map((r) => [r.bucket, { n: Number(r.n), oldest: parseStamp(r.oldest) }]));
}

async function charge(buckets: string[], now: number, windowMs: number): Promise<void> {
  const at = stamp(now);
  await run(
    `INSERT INTO auth_attempts (bucket, at) VALUES ${buckets.map(() => "(?, ?)").join(", ")}`,
    buckets.flatMap((b) => [b, at])
  );
  // Occasional sweep, rather than a cron nobody would deploy. Rows outside every
  // window can never affect a decision, so losing the race to delete them is free.
  if (Math.random() < 0.02) {
    await run("DELETE FROM auth_attempts WHERE at < ?", [stamp(now - Math.max(windowMs, WINDOW_MS))]);
  }
}

/**
 * The general primitive: charge one attempt against `key` and say whether it was
 * within `max` per `windowMs`. Callers that limit something other than a login
 * (join-code guessing, signup floods) use this with their own key and budget.
 *
 * Every call charges, so a caller gets the same cost for a right answer as a
 * wrong one — which is what stops the limit itself from being an oracle.
 */
export async function rateLimit(
  key: string,
  opts: { max: number; windowMs: number }
): Promise<{ ok: boolean; retryAfterS?: number }> {
  try {
    await ensureTable();
    const now = Date.now();
    const rows = await all<{ n: number | string; oldest: string }>(
      `SELECT COUNT(*) AS n, MIN(at) AS oldest
         FROM auth_attempts
        WHERE bucket = ? AND at >= ?`,
      [key, stamp(now - opts.windowMs)]
    );
    const n = rows[0] ? Number(rows[0].n) : 0;
    if (n >= opts.max && rows[0]?.oldest) {
      const freeAt = parseStamp(rows[0].oldest) + opts.windowMs;
      return { ok: false, retryAfterS: Math.max(Math.ceil((freeAt - now) / 1000), 1) };
    }
    await charge([key], now, opts.windowMs);
    return { ok: true };
  } catch (e) {
    console.error("[rateLimit] failed, allowing request:", e);
    return { ok: true };
  }
}

/**
 * A per-caller budget for an expensive endpoint, keyed on IP.
 *
 * Distinct from `checkAuthRate`, which protects a CREDENTIAL and therefore keys
 * on the identity being guessed. Nothing is being guessed here — the caller is
 * already authenticated — so the only thing worth bounding is how much work one
 * client can ask for.
 *
 * Written for `/api/chat`, which was the one authenticated route with no bound
 * on it and which the public demo made reachable by anyone with the link. Each
 * call runs `buildProfile` (a dozen queries) and, once an ANTHROPIC_API_KEY is
 * set, a paid model call. Twelve a minute is far above how fast a person types
 * a question and far below what a script would want.
 *
 * `clientIp` returns "unknown" with no proxy headers, so every local caller
 * shares one bucket. That errs toward limiting too much, which is the right
 * direction — and behind Vercel the header is platform-set and unspoofable.
 */
export async function checkRequestRate(
  request: Request,
  label: string,
  opts: { max: number; windowMs: number }
): Promise<LimitDecision> {
  const r = await rateLimit(`${label}:ip:${clientIp(request)}`, opts);
  return r.ok ? { allowed: true } : { allowed: false, retryAfter: r.retryAfterS ?? 60 };
}

/** The 429 for a budget rather than a credential — different words, same shape. */
export function tooManyRequests(retryAfter: number): Response {
  return Response.json(
    {
      error: `That's a lot of questions at once — give it ${retryAfter} second${
        retryAfter === 1 ? "" : "s"
      } and ask again.`,
    },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

/**
 * Should this login attempt be allowed to reach the password check?
 *
 * `identifier` is whatever the caller is authenticating as — an email, or a
 * fixed label for credential paths that have no account name (see the token
 * path in athlete-login). Never pass the secret itself: a bucket keyed on the
 * guess is a fresh bucket per guess, which counts nothing.
 */
export async function checkAuthRate(request: Request, identifier: string): Promise<LimitDecision> {
  try {
    await ensureTable();
    const now = Date.now();
    const k = keys(request, identifier);
    const counts = await tally([k.pair, k.ip], now);

    let retryAfter = 0;
    for (const [bucket, max] of [
      [k.pair, PAIR_MAX],
      [k.ip, IP_MAX],
    ] as const) {
      const t = counts.get(bucket);
      if (!t || t.n < max) continue;
      retryAfter = Math.max(retryAfter, Math.ceil((t.oldest + WINDOW_MS - now) / 1000));
    }
    if (retryAfter > 0) return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
    return { allowed: true };
  } catch (e) {
    console.error("[rateLimit] check failed, allowing request:", e);
    return { allowed: true };
  }
}

/** Record one failed attempt against both buckets. */
export async function recordAuthFailure(request: Request, identifier: string): Promise<void> {
  try {
    await ensureTable();
    const k = keys(request, identifier);
    await charge([k.pair, k.ip], Date.now(), WINDOW_MS);
  } catch (e) {
    console.error("[rateLimit] record failed:", e);
  }
}

/**
 * The 429.
 *
 * One wording for every rejected attempt. A limiter that said "too many
 * attempts for this account" on a real email and something else on an unknown
 * one would be an account-enumeration oracle wearing a security feature's
 * clothes — so this says nothing about whether the account exists, and the
 * routes send it before any lookup happens.
 */
export function tooManyAttempts(retryAfter: number): Response {
  const mins = Math.ceil(retryAfter / 60);
  return Response.json(
    { error: `Too many sign-in attempts. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
