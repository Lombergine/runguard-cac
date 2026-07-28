import { redirect } from "next/navigation";
import { authorizeUrl, stravaConfigured } from "@/lib/strava";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const athleteId = Number(url.searchParams.get("athlete"));
  if (!stravaConfigured()) {
    return Response.json(
      {
        error:
          "Strava is not configured. Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET to your .env file (create an API app at strava.com/settings/api).",
      },
      { status: 400 }
    );
  }
  if (!Number.isInteger(athleteId)) {
    return Response.json({ error: "Missing athlete id" }, { status: 400 });
  }
  redirect(authorizeUrl(athleteId, url.origin));
}
