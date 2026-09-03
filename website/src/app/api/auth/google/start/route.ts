import { authorizeUrl, googleConfigured, type Role } from "@/lib/googleAuth";
import { checkRequestRate, tooManyRequests } from "@/lib/rateLimit";

/**
 * Begin a Google sign-in. `?role=coach` or `?role=athlete` picks the door.
 *
 * The role is a door, not a mode — the same distinction the app's own login
 * screen makes. Coaches are a row in `teams`, athletes a row in `athletes`, and
 * there is no shared identity table, so the callback has to know which one it
 * is looking in before it can look. It reads that from the state row it
 * redeems, never from the callback URL.
 */
export async function GET(request: Request): Promise<Response> {
  if (!googleConfigured()) {
    return Response.json({ error: "Google sign-in is not configured" }, { status: 503 });
  }

  const raw = new URL(request.url).searchParams.get("role");
  const role: Role | null = raw === "coach" || raw === "athlete" ? raw : null;
  if (!role) {
    return Response.json({ error: "role must be coach or athlete" }, { status: 400 });
  }

  // This is an unauthenticated GET that WRITES a row, which is a combination
  // nothing else in this app has. Expired handshakes are only swept when a new
  // one starts, so without a ceiling anyone could sit on this URL and insert
  // rows faster than the sweep clears them. A person signing in makes a handful
  // of attempts; a script makes thousands.
  const gate = await checkRequestRate(request, "google-sso", { max: 20, windowMs: 15 * 60_000 });
  if (!gate.allowed) return tooManyRequests(gate.retryAfter);

  return Response.redirect(await authorizeUrl(role), 302);
}
