import { redirect } from "next/navigation";
import { getSql } from "@/lib/db";
import { exchangeCode, verifyState, syncAthlete } from "@/lib/strava";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const athleteId = verifyState(state);

  if (!code || athleteId === null) {
    redirect("/dashboard/connect?error=strava_denied");
  }

  const tok = await exchangeCode(code);
  await getSql()`
    update athletes set
      strava_athlete_id = ${String(tok.athlete?.id ?? "")},
      strava_access_token = ${tok.access_token},
      strava_refresh_token = ${tok.refresh_token},
      strava_expires_at = ${tok.expires_at}
    where id = ${athleteId}`;

  // pull history right away so the dashboard fills in
  try {
    await syncAthlete(athleteId);
  } catch {
    // athlete can retry from the connect page
  }
  redirect("/dashboard/connect?connected=1");
}
