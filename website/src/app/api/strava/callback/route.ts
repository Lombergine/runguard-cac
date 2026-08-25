import { redirect } from "next/navigation";
import { run } from "@/lib/db/driver";
import { exchangeCode, verifyState, syncAthlete } from "@/lib/strava";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  // Consumes the state: expired, forged, or already-redeemed all give null.
  const athleteId = await verifyState(state);

  if (!code || athleteId === null) {
    redirect("/dashboard/connect?error=strava_denied");
  }

  const tok = await exchangeCode(code);
  await run(
    "UPDATE athletes SET strava_athlete_id=?, strava_access_token=?, strava_refresh_token=?, strava_expires_at=? WHERE id=?",
    [
      String(tok.athlete?.id ?? ""),
      tok.access_token,
      tok.refresh_token,
      tok.expires_at,
      athleteId,
    ]
  );

  // pull history right away so the dashboard fills in
  try {
    await syncAthlete(athleteId);
  } catch {
    // athlete can retry from the connect page
  }
  redirect("/dashboard/connect?connected=1");
}
