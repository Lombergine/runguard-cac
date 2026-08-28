import type { AthleteRow } from "./db";
import { athletesForTeam } from "./db";
import { demoAthleteId, demoTeamId } from "./demo";

/**
 * Which athlete the demo is, and the fact that nobody may write as them.
 *
 * ── WHY THE PHONE NEEDED ITS OWN ANSWER ─────────────────────────────────────
 *
 * `middleware.ts` makes the web demo read-only by refusing every non-GET for a
 * request carrying the `rg_demo` cookie. That is the right shape for a browser
 * and it does nothing at all for the app, which authenticates with
 * `Authorization: Bearer <device_token>` and sends no cookies. Handing the app a
 * demo token without this file would mean a visitor tapping "Explore the demo"
 * could check in, log a race and edit an HRmax straight into the roster every
 * coach is being shown.
 *
 * Middleware cannot fix that: deciding whether a Bearer token belongs to the
 * demo athlete needs a database read, and middleware runs on the edge runtime
 * with no database.
 *
 * ── WHY THE REFUSAL LIVES IN `resolveAthleteWithPath` ───────────────────────
 *
 * Because that is the one function EVERY route already calls to find out who is
 * asking. Putting the check there means a route added next month is covered
 * without its author knowing this file exists — which is the same argument
 * `middleware.ts` makes for itself: "a per-route check is a convention; it holds
 * until someone adds the next route and does not think about the demo, and the
 * failure is silent."
 *
 * The refusal is expressed as "this athlete does not resolve", so routes take
 * their existing not-authorised branch. No route needed changing, and none can
 * forget.
 *
 * ── WHY THE ATHLETE AND NOT THE TEAM ────────────────────────────────────────
 *
 * Gating on `team_id === demoTeamId()` would be simpler and is wrong: it makes
 * the WHOLE seeded roster read-only, and that roster is what local development
 * runs against. Every check-in written while testing would start failing the
 * moment someone set `DEMO_TEAM_ID`. Only the one athlete the demo actually
 * opens as is frozen.
 */

/**
 * The demo athlete, chosen from the demo team's roster.
 *
 * `DEMO_ATHLETE_ID` narrows it to a specific runner, but it is CHECKED against
 * that roster rather than trusted — pointing it at someone on another team falls
 * back to the demo roster instead of handing out that athlete's credential.
 * Alphabetical, so an unconfigured demo always opens on the same runner rather
 * than on whoever the database happened to return first.
 *
 * This is the same rule `api/demo/athlete/route.ts` applies for the web, lifted
 * here so the two doors cannot open as different people.
 */
export function resolveDemoAthlete(
  roster: readonly AthleteRow[],
  wanted: number | null
): AthleteRow | undefined {
  const byName = [...roster].sort((a, b) => a.name.localeCompare(b.name));
  return (wanted !== null ? byName.find((a) => a.id === wanted) : undefined) ?? byName[0];
}

/**
 * Is this athlete the one the demo opens as?
 *
 * Returns false whenever the demo is switched off, so with `DEMO_TEAM_ID` unset
 * this file changes nothing anywhere.
 */
export async function isDemoAthlete(athlete: { id: number }): Promise<boolean> {
  const teamId = demoTeamId();
  if (teamId === null) return false;
  const demo = resolveDemoAthlete(await athletesForTeam(teamId), demoAthleteId());
  return demo?.id === athlete.id;
}

/**
 * Everything except GET and HEAD, matching `middleware.ts`.
 *
 * Deliberately not a list of mutating routes — a list is the same convention
 * problem this file exists to avoid, one level up.
 */
export function isWrite(method: string): boolean {
  const m = method.toUpperCase();
  return m !== "GET" && m !== "HEAD";
}
