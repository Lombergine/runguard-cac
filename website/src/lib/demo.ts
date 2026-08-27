/**
 * The public demo.
 *
 * WHAT THIS IS, AND WHY IT IS NOT THE HOLE THE AUDIT CLOSED.
 *
 * `session.ts` documents a deleted branch that accepted a computable cookie as a
 * coach session for team 1 — a credential-free login that reached real athlete
 * data and could write to it. Nothing here reinstates that, and the difference
 * is not "this one is careful":
 *
 *  1. IT GRANTS ONLY WHAT A PUBLIC BUTTON ALREADY GRANTS. The demo link is on
 *     the landing page for anyone to click. Forging the cookie therefore buys an
 *     attacker exactly nothing they could not get by clicking. The deleted
 *     branch, by contrast, granted a real coach session nobody was meant to have.
 *  2. IT IS PINNED TO ONE TEAM, and that team id comes from the SERVER's own
 *     environment at read time — it is never carried in the cookie, so there is
 *     no attacker-controlled field to edit into another team's id. That was the
 *     precise shape of the original bug.
 *  3. IT IS READ-ONLY, enforced in middleware.ts on every non-GET request rather
 *     than route by route, so a route added tomorrow is covered by default.
 *  4. IT IS OFF UNLESS TURNED ON. With DEMO_TEAM_ID unset there is no demo
 *     route, no demo cookie, and nothing to forge.
 *
 * WHAT MUST STAY TRUE. The demo team must contain only seeded data. The moment a
 * real athlete joins it, every visitor to the public link is reading a real
 * minor's health record. Nothing in code can check that for you — it is a
 * property of which team id you point this at.
 */

/**
 * A second cookie, set beside the session, whose only job is to be visible to
 * middleware.
 *
 * Middleware runs on the edge runtime and does not verify this signature — it
 * only asks whether the cookie is PRESENT. That is safe in the one direction
 * that matters: a forged `rg_demo` causes MORE refusal, never less. A visitor
 * who sets it by hand has locked themselves out of writing, which is not an
 * attack. Verification for anything that grants rather than withholds happens
 * server-side in `isDemoSession()`.
 */
export const DEMO_COOKIE = "rg_demo";

/**
 * The team the demo shows, or null when the demo is switched off.
 *
 * Deliberately NOT defaulted to 1. A default would mean that any deployment
 * that forgot to set it would quietly publish whichever team happened to be
 * first in its database — which, once a real coach signs up, is a real roster.
 * Off is the safe default and an explicit id is the only way on.
 */
export function demoTeamId(): number | null {
  const raw = process.env.DEMO_TEAM_ID;
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function demoEnabled(): boolean {
  return demoTeamId() !== null;
}

/**
 * Which athlete the "see it as an athlete" link opens as.
 *
 * Optional: with DEMO_ATHLETE_ID unset the route picks the first athlete on the
 * demo team by name, so the demo works with nothing configured beyond the team.
 * Set it when you want the link to land on a specific runner — the one whose
 * data best tells the story.
 */
export function demoAthleteId(): number | null {
  const raw = process.env.DEMO_ATHLETE_ID;
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
