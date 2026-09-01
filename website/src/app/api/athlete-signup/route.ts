import { athleteLogIn, signAthleteToken } from "@/lib/session";
import { checkAuthRate, recordAuthFailure } from "@/lib/rateLimit";
import {
  createAthleteAccount,
  getAthleteByEmail,
  getTeamByCode,
  hashPassword,
} from "@/lib/db";

const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/** Same shape as the login 429, worded for the thing that was actually refused. */
function tooManySignups(retryAfter: number): Response {
  const mins = Math.ceil(retryAfter / 60);
  return Response.json(
    { error: `Too many sign-up attempts. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const joinCode = typeof body.joinCode === "string" ? body.joinCode.trim() : "";

  if (!name || !email || !password) {
    return Response.json({ error: "Fill in your name, email, and password." }, { status: 400 });
  }
  if (!emailOk(email)) {
    return Response.json({ error: "That email doesn't look right." }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Use at least 8 characters for your password." }, { status: 400 });
  }

  // NOT ANSWERED and ANSWERED WRONGLY are two different things, and folding them
  // together is the silent-drop this project keeps finding. `grade` was
  // `Number.isInteger(body.grade) ? body.grade : null`, so "11" — or any value
  // the client failed to coerce — was stored as "no answer" and the response
  // still said ok. Absent or null still means unanswered; a value that is present
  // and not an integer is now refused rather than discarded.
  const gradeGiven = body.grade !== undefined && body.grade !== null;
  if (gradeGiven && !Number.isInteger(body.grade)) {
    return Response.json(
      { error: "Grade must be a whole number, or left blank." },
      { status: 400 }
    );
  }
  const grade: number | null = gradeGiven ? body.grade : null;

  // Same split. An unrecognised event group used to be silently replaced by
  // "distance", which stores an answer the athlete never gave and reports
  // success — a fabricated value wearing the athlete's name. Absent still takes
  // the default the schema documents; present-but-unknown is refused.
  const EVENT_GROUPS = ["distance", "mid", "sprint"] as const;
  const groupGiven = body.eventGroup !== undefined && body.eventGroup !== null;
  if (groupGiven && !EVENT_GROUPS.includes(body.eventGroup)) {
    return Response.json(
      { error: "Choose an event group: distance, mid, or sprint." },
      { status: 400 }
    );
  }
  const eventGroup: string = groupGiven ? body.eventGroup : "distance";

  // Signup stays open — an athlete can join solo, that is the product. What is
  // capped is the RATE, because a success here mints a live athlete session (see
  // the response body) and the join-code branch below is a second guessing
  // surface reachable with no account at all. Gated before either DB lookup, so
  // a throttled caller learns nothing about which emails or codes exist.
  const gate = await checkAuthRate(request, email);
  if (!gate.allowed) return tooManySignups(gate.retryAfter);
  // Charged on every attempt that gets this far, not only on the ones that
  // succeed: the 409 below is an account-existence oracle and the 404 above is a
  // team-code oracle, and an uncharged failure is a free query against both.
  await recordAuthFailure(request, email);

  // Team is OPTIONAL — an athlete can join solo and use the whole app alone.
  let teamId: number | null = null;
  let teamName: string | null = null;
  if (joinCode) {
    const team = await getTeamByCode(joinCode);
    if (!team) {
      return Response.json(
        { error: "That team code doesn't match any team. Leave it blank to join on your own." },
        { status: 404 }
      );
    }
    teamId = team.id;
    teamName = team.name;
  }

  if (await getAthleteByEmail(email)) {
    return Response.json({ error: "An account with that email already exists — log in instead." }, { status: 409 });
  }

  const athlete = await createAthleteAccount({
    name,
    email,
    password_hash: hashPassword(password),
    team_id: teamId,
    grade,
    event_group: eventGroup,
  });
  await athleteLogIn(athlete.id);
  return Response.json({
    ok: true,
    name: athlete.name,
    team: teamName,
    // The same signed session the login route returns, so the iOS app can sign
    // up directly and be authenticated on the next request. Signed, never
    // stored: see `signAthleteToken` in lib/session.ts.
    token: signAthleteToken(athlete.id, athlete.token_version),
  });
}
