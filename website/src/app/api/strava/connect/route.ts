import { redirect } from "next/navigation";
import { authorizeUrl, stravaConfigured } from "@/lib/strava";
import { resolveAthlete } from "@/lib/apiAuth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  // `Number(null)` is 0 and `Number.isInteger(0)` is true, so reading the param
  // straight into Number() turned a MISSING ?athlete= into a request for athlete
  // 0 — which scopes against an id no row has, 401s, and makes the "Missing
  // athlete id" branch below unreachable. Fails closed either way; it just
  // answered the wrong question.
  const param = url.searchParams.get("athlete");
  const raw = param === null ? NaN : Number(param);
  const requestedId = Number.isInteger(raw) ? raw : null;
  // This endpoint had NO auth check of any kind. Any unauthenticated visitor
  // could hit ?athlete=N, complete the Strava OAuth flow, and the callback would
  // write THEIR Strava tokens onto athlete N's row and sync their history in.
  // Adding resolveAthlete closed that for the cookie paths only: the Bearer path
  // did not compare ids, so a device token plus ?athlete=<victim> still passed.
  // That is fixed in apiAuth; signing the state below from `athlete.id` rather
  // than `requestedId` is the second layer — even a permissive resolver can no
  // longer get a victim's id into the state the callback writes tokens against.
  const athlete = await resolveAthlete(request, requestedId);
  if (!athlete) {
    return Response.json({ error: "Not authorized" }, { status: 401 });
  }
  if (!stravaConfigured()) {
    return Response.json(
      {
        error:
          "Strava is not configured. Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET to your .env file (create an API app at strava.com/settings/api).",
      },
      { status: 400 }
    );
  }
  if (requestedId === null) {
    return Response.json({ error: "Missing athlete id" }, { status: 400 });
  }
  // authorizeUrl now records the pending handshake server-side, so it awaits.
  const target = await authorizeUrl(athlete.id, url.origin);
  // redirect() throws NEXT_REDIRECT, so it stays outside any try/catch.
  redirect(target);
}
