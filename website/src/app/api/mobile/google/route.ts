import { signTeam, signAthleteToken } from "@/lib/session";
import { getTeamByCoachEmail, getAthleteByEmail } from "@/lib/db";
import { emailFromNativeCode, googleNativeConfigured } from "@/lib/googleAuth";
import { checkRequestRate, tooManyRequests } from "@/lib/rateLimit";

/**
 * Google sign-in for the phone.
 *
 * The web equivalent is `/api/auth/google/callback`, and the difference is the
 * same one that separates `/api/login` from `/api/mobile/coach-login`: that
 * route writes an httpOnly cookie and redirects to a page, this one hands the
 * identical signed string back for the keychain. Same `signTeam` /
 * `signAthleteToken`, same HMAC, same verifiers. There is no second scheme.
 *
 * WHY THE APP SENDS A CODE AND NOT AN id_token. An id_token posted by a client
 * is an attacker-supplied string, and accepting one without full JWKS signature
 * verification is the standard way these integrations are broken into. A code
 * is useless to anyone who does not also hold the PKCE verifier, and redeeming
 * it here means the id_token arrives over TLS from Google's own token endpoint,
 * in a request this server made — which is what makes skipping JWKS sound. See
 * the note at the top of lib/googleAuth.ts.
 *
 * NO ACCOUNT IS CREATED HERE. A Google identity carries an email and nothing
 * else, while a team needs a name and an athlete needs a join code. The app
 * cannot render the web signup form, so an unrecognised address gets a 404 the
 * app explains rather than a half-built row on somebody's roster.
 */
export async function POST(request: Request) {
  if (!googleNativeConfigured()) {
    return Response.json({ error: "Google sign-in is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code : "";
  const codeVerifier = typeof body.codeVerifier === "string" ? body.codeVerifier : "";
  const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri : "";
  const role = body.role === "coach" || body.role === "athlete" ? body.role : null;

  if (!code || !codeVerifier || !redirectUri || !role) {
    return Response.json({ error: "That sign-in didn't complete." }, { status: 400 });
  }

  // Keyed on the caller rather than an account, because at this point we do not
  // know which account this is — the address only exists after the exchange.
  // The exchange itself is a paid outbound request to Google, which is the
  // thing worth a ceiling.
  const gate = await checkRequestRate(request, "google-native", {
    max: 20,
    windowMs: 15 * 60_000,
  });
  if (!gate.allowed) return tooManyRequests(gate.retryAfter);

  const email = await emailFromNativeCode(code, codeVerifier, redirectUri);
  if (!email) {
    return Response.json({ error: "That sign-in didn't complete." }, { status: 401 });
  }

  if (role === "coach") {
    const team = await getTeamByCoachEmail(email);
    if (!team) {
      return Response.json(
        { error: "No coach account uses that Google address yet. Create your team on the web first." },
        { status: 404 }
      );
    }
    // Returned and never logged. It is the whole credential, so anywhere it
    // could be written down is somewhere it has leaked.
    return Response.json({ token: signTeam(team.id, team.token_version), team: team.name });
  }

  const athlete = await getAthleteByEmail(email);
  if (!athlete) {
    return Response.json(
      { error: "No RunGuard account uses that Google address yet. Create one first." },
      { status: 404 }
    );
  }
  return Response.json({ token: signAthleteToken(athlete.id, athlete.token_version), name: athlete.name });
}
