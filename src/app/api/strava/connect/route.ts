import { redirect } from "next/navigation";
import { authorizeUrl, stravaConfigured } from "@/lib/strava";
import { resolveAthlete } from "@/lib/apiAuth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("athlete"));
  // This endpoint had NO auth check of any kind. Any unauthenticated visitor
  // could hit ?athlete=N, complete the Strava OAuth flow, and the callback would
  // write THEIR Strava tokens onto athlete N's row and sync their history in.
  //
  // The id that goes into the signed OAuth `state` MUST be the resolved
  // athlete's, never the query string's. Authorizing one principal and then
  // acting on an unvalidated id is how the fix above got reopened: the bearer
  // branch of resolveAthlete used to ignore athleteId, so any athlete holding
  // their own device token could name a victim here, finish Strava's OAuth with
  // their own account, and have the callback bind those tokens onto the
  // victim's row — across teams, since bearer had no team scoping.
  const athlete = await resolveAthlete(request, Number.isInteger(requested) ? requested : null);
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
  redirect(authorizeUrl(athlete.id, url.origin));
}
