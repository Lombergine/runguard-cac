import { emailFromCode, googleConfigured, verifyState } from "@/lib/googleAuth";
import { getTeamByCoachEmail, getAthleteByEmail } from "@/lib/db";
import { logIn, athleteLogIn } from "@/lib/session";

/**
 * Finish a Google sign-in.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: create an account. A Google identity
 * carries an email and nothing else, while a coach signup needs a team name and
 * an athlete signup needs a name and a join code. Inventing values for those
 * would put a half-built team on the roster, so an unrecognised address is sent
 * to the existing signup form with the address prefilled instead. One flow
 * signs people in; the other creates them.
 *
 * The identity is Google's verified email, and the door comes from the state
 * row. Neither is read from the query string, which is the whole point.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (!googleConfigured()) return Response.redirect(new URL("/login?sso=off", url.origin), 302);

  // Google reports a declined consent screen here. It is not a failure worth a
  // distinct message — the athlete pressed cancel.
  if (url.searchParams.get("error")) {
    return Response.redirect(new URL("/login", url.origin), 302);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return Response.redirect(new URL("/login?sso=failed", url.origin), 302);

  // Consumes the state. A replayed callback URL gets null here and cannot
  // proceed, which is what this table exists for.
  const pending = await verifyState(state);
  if (!pending) return Response.redirect(new URL("/login?sso=failed", url.origin), 302);

  const email = await emailFromCode(code, pending.codeVerifier);
  if (!email) return Response.redirect(new URL("/login?sso=failed", url.origin), 302);

  // Both lookups are already `lower(...) = lower(?)`, which matters: the UNIQUE
  // constraints are on the raw column, so `Alice@x.com` and `alice@x.com` can
  // both exist as rows. Matching case-insensitively links to whichever one is
  // there rather than minting a second account for the same person.
  if (pending.role === "coach") {
    const team = await getTeamByCoachEmail(email);
    if (!team) {
      return Response.redirect(
        new URL(`/signup?email=${encodeURIComponent(email)}`, url.origin),
        302
      );
    }
    await logIn(team.id);
    return Response.redirect(new URL("/dashboard", url.origin), 302);
  }

  const athlete = await getAthleteByEmail(email);
  if (!athlete) {
    return Response.redirect(
      new URL(`/athlete/signup?email=${encodeURIComponent(email)}`, url.origin),
      302
    );
  }
  await athleteLogIn(athlete.id);
  return Response.redirect(new URL("/athlete", url.origin), 302);
}
