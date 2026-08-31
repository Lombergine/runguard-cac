import { getAthlete, AthleteRow } from "./db";
import { isDemoAthlete, isWrite } from "./demoAthlete";
import {
  athleteTokenFromCookie,
  currentTeamId,
  verifyAthleteToken,
  verifyCoachToken,
} from "./session";

/** Which of the three auth paths matched. */
export type AuthPath = "bearer" | "athlete" | "coach";

/**
 * Resolve which athlete a request acts for, and say HOW it resolved. Three paths:
 *  - iOS app: Authorization: Bearer <athlete session token> → that athlete
 *  - Athlete web portal: athlete session cookie → that athlete (themselves only)
 *  - Coach web session: coach cookie + explicit athleteId, scoped to their team
 *
 * The first two carry the SAME value — `signAthleteToken(id)` from lib/session.ts
 * — so both resolve the same way: verify the HMAC, then load the athlete the
 * signature names. Neither reads `athletes.device_token`; that column authenticates
 * nothing any more.
 *
 * Callers need the path, not just the row: a coach reading an athlete's chat is
 * a different thing from the athlete reading their own, and only one of them
 * should see safety-intercepted messages.
 */
export async function resolveAthleteWithPath(
  request: Request,
  athleteId?: number | null
): Promise<{ athlete: AthleteRow; via: AuthPath } | null> {
  // The single scope gate every path goes through. The Bearer path used to skip
  // it and return the token's own athlete no matter which id the caller asked
  // for, so `resolveAthlete(request, victimId)` answered truthily for any device
  // token — an IDOR wherever the route then trusted the client's id (it did, in
  // two now-deleted sync routes). Applying it by construction here means a
  // fourth auth path cannot reintroduce the hole by forgetting the comparison.
  const scoped = (a: AthleteRow | null | undefined, via: AuthPath) =>
    a && (athleteId == null || athleteId === a.id) ? { athlete: a, via } : null;

  /**
   * The demo athlete never resolves for a WRITE, on any route, by construction.
   *
   * `middleware.ts` already makes the web demo read-only, but it does that by
   * looking for the `rg_demo` COOKIE — and the phone sends a Bearer token and no
   * cookies, so none of it applies to `/api/mobile/*`. Middleware cannot cover
   * this case either: telling whether a token belongs to the demo athlete needs
   * a database read, and it runs on the edge runtime without one.
   *
   * So the check lands here, in the one function every route already calls to
   * ask who is speaking. A route added later is covered without its author
   * knowing this exists. Expressed as "does not resolve" rather than as its own
   * error, so callers take the not-authorised branch they already have.
   *
   * See `lib/demoAthlete.ts` for why this is the demo ATHLETE and not the demo
   * team (freezing the team would freeze the roster local development runs on).
   */
  const guard = async (r: { athlete: AthleteRow; via: AuthPath } | null) => {
    if (!r || !isWrite(request.method)) return r;
    return (await isDemoAthlete(r.athlete)) ? null : r;
  };

  // The token names the athlete and the HMAC proves it, so the lookup is by id.
  // There is no secret in the database to compare against and nothing to leak by
  // comparing it — a forged or expired-by-secret-rotation token fails before any
  // query runs.
  const auth = request.headers.get("authorization") || "";
  const bearerId = auth.startsWith("Bearer ") ? verifyAthleteToken(auth.slice(7)) : null;
  if (bearerId !== null) {
    const r = await guard(scoped(await getAthlete(bearerId), "bearer"));
    if (r) return r;
  }
  const cookieId = verifyAthleteToken((await athleteTokenFromCookie()) ?? undefined);
  if (cookieId !== null) {
    const r = await guard(scoped(await getAthlete(cookieId), "athlete"));
    if (r) return r;
  }
  if (athleteId != null && Number.isInteger(athleteId)) {
    // Team-scoped. Without this check, ANY valid coach session reached ANY
    // athlete on ANY team — the previous code only asked whether a coach session
    // existed. currentTeamId() verifies the same cookie isLoggedIn() did, so
    // this is one cookie read rather than two.
    const teamId = await currentTeamId();
    if (teamId == null) return null;
    const a = await getAthlete(athleteId);
    if (a && a.team_id === teamId) return scoped(a, "coach");
  }
  return null;
}

/**
 * Which TEAM a request acts for, for the coach-on-a-phone routes.
 *
 * A SEPARATE function from `resolveAthleteWithPath` on purpose, and the comment
 * inside that one says why: it is a scope gate whose whole value is that every
 * path through it is compared against the requested athlete id by construction.
 * A coach branch bolted in there would resolve to a TEAM, which has no athlete
 * id to compare against, so it would have to sidestep the gate — reintroducing
 * exactly the IDOR the gate exists to make impossible. Two questions, two
 * functions: "may this act for athlete N" and "which team is this".
 *
 * The credential is the same signed value the web coach session carries
 * (`signTeam` in lib/session.ts), sent as `Authorization: Bearer` because the
 * phone has no cookie jar. It is self-describing and HMAC-verified, so this
 * needs no database read and cannot be pointed at another team by editing it.
 *
 * Returns null for anything that is not a valid coach token — including a valid
 * ATHLETE session token. Those are `a.<athleteId>.<sig>`, so `Number("a.<id>")`
 * is NaN and this bails before verifying; and even if the parse were looser, the
 * two kinds sign different strings (`coach:<id>` vs `athlete:<id>`), so an
 * athlete's signature can never match a team's. Domain separation is in the
 * signed message, not in the parsing.
 */
export async function resolveCoachTeam(request: Request): Promise<number | null> {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return verifyCoachToken(auth.slice(7));
}

export async function resolveAthlete(
  request: Request,
  athleteId?: number | null
): Promise<AthleteRow | null> {
  const r = await resolveAthleteWithPath(request, athleteId);
  return r ? r.athlete : null;
}

/* ------------------------------------------------------------------ *
 *  Self-only routes
 * ------------------------------------------------------------------ */

/**
 * Some things only the athlete may write.
 *
 * `resolveAthlete` answers "may this request act for athlete N", and a coach
 * session plus an athleteId on their own team is a legitimate yes — that is how
 * the coach dashboard reads. But a subset of routes record what the ATHLETE
 * said or did, and for those a coach acting as them is not an authorisation
 * question, it is a data-integrity one:
 *
 *  - /api/checkin writes soreness, RPE, energy and academic stress. Those feed
 *    readiness and the roster's soreness flags — the same flags the coach then
 *    reads. A coach filing a check-in makes the system report the athlete's
 *    condition back to the coach who invented it. Self-report is the most
 *    sensitive signal RunGuard has and the only one it cannot verify.
 *  - /api/workout-status is the athlete's record of what they actually ran.
 *  - /api/goal is the athlete's own PR target.
 *  - /api/race-result carries `feel`, and race_results has no UPDATE or DELETE
 *    path anywhere in the repo, so anything written there is permanent.
 *
 * The web UI never offered a coach these forms, so nothing regresses. The point
 * is that it was only the UI stopping them: a coach cookie and a curl would
 * have been accepted. This makes it structural.
 *
 * Objective, team-level facts stay coach-writable on purpose — an upcoming race,
 * a recorded injury, a tested max heart rate are all things a coach legitimately
 * knows and enters.
 */
export function isSelf(via: AuthPath): boolean {
  return via === "bearer" || via === "athlete";
}

/** The 403 for a coach reaching a self-only route. */
export function selfOnlyResponse(what: string): Response {
  return Response.json(
    {
      error: `Only the athlete can ${what}. Coaches can see it once it is recorded, but entering it for them would put words in their mouth — and readiness is built out of exactly this.`,
    },
    { status: 403 }
  );
}

/**
 * The mirror image: things only the coach may write.
 *
 * `/api/injury` is the one. Both the athlete app and the athlete portal already
 * document it as coach-only — `app/src/components/ProfilePanels.tsx` says so in
 * as many words, and renders the injury list read-only on that basis — but the
 * route accepted any resolved athlete, so the contract the app was written
 * against was a comment rather than a rule. An injury is a clinical judgement
 * recorded ABOUT an athlete; soreness is what the athlete reports, and that is
 * `/api/checkin`, which is self-only for the opposite reason.
 */
export function coachOnlyResponse(what: string): Response {
  return Response.json(
    {
      error: `Only a coach can ${what}. If something hurts, log it as soreness on your check-in — that reaches your coach and it is yours to describe.`,
    },
    { status: 403 }
  );
}
