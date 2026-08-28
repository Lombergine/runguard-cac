/**
 * Demo mode: everything works, nothing is written.
 *
 * ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────
 *
 * A demo that is read-only in the honest sense — taps do nothing — is not a
 * demo of THIS app. The product is a check-in: two taps before practice. An
 * athlete or a coach trying it has seen nothing at all until they have tapped
 * "Good" and watched the card collapse into a receipt with readiness underneath.
 *
 * So the demo has to accept input. It just must never spend it. Every write
 * made in demo mode is applied HERE, in memory, and the request is never sent.
 *
 * ── WHY THE SERVER ALSO REFUSES ─────────────────────────────────────────────
 *
 * This file is a convenience, not the guarantee. It runs on a device someone
 * else controls, and the demo token it holds is a real credential for a real
 * row. The actual guarantee is server-side: `website/src/lib/demoAthlete.ts`
 * makes the demo athlete fail to resolve for any non-GET, on every route at
 * once, so even a hand-written request cannot write as them.
 *
 * Two layers, doing different jobs: the server one keeps the roster safe, and
 * this one keeps the demo worth looking at.
 *
 * ── WHY IN MEMORY AND NOT ON DISK ───────────────────────────────────────────
 *
 * `auth.ts` holds a contract — every key this app stores is listed in
 * `ALL_KEYS` and erased on sign-out. A persisted demo overlay would either join
 * that list (and be wiped anyway, so it would buy nothing) or become the one
 * key that outlives a sign-out, which is exactly the shape of the leak the
 * contract exists to prevent. A demo is a visit, not an account: it lasts as
 * long as the app is open, and leaves nothing behind.
 */

/** Set once the session was opened by the demo button rather than a pairing. */
let demoSession = false;

/**
 * Writes the demo has accepted, newest last, keyed by the route they would have
 * gone to. Read back by `overlay()` so a screen sees its own change.
 */
type Write = { path: string; body: unknown };
let writes: Write[] = [];

export function enterDemo(): void {
  demoSession = true;
  writes = [];
}

/**
 * Cleared on sign-out along with everything else — `session.tsx` calls this, so
 * leaving the demo and pairing for real cannot inherit a demo write.
 */
export function exitDemo(): void {
  demoSession = false;
  writes = [];
}

export function isDemo(): boolean {
  return demoSession;
}

/** Record a write the demo made instead of sending it. */
export function recordWrite(path: string, body: unknown): void {
  writes.push({ path, body });
}

/** Every demo write so far, oldest first. */
export function demoWrites(): readonly Write[] {
  return writes;
}

/**
 * The most recent body written to `path`, or null.
 *
 * Deliberately last-wins rather than merged: a second check-in replaces the
 * first, which is what the server would have done too (`upsertCheckin`).
 */
export function lastWrite(path: string): unknown | null {
  for (let i = writes.length - 1; i >= 0; i--) {
    if (writes[i].path === path) return writes[i].body;
  }
  return null;
}
