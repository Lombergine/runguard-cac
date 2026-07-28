import { isLoggedIn } from "@/lib/session";
import { syncAthlete } from "@/lib/strava";

export async function POST(request: Request) {
  if (!(await isLoggedIn())) {
    return Response.json({ error: "Not authorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const athleteId = Number(body.athleteId);
  if (!Number.isInteger(athleteId)) {
    return Response.json({ error: "Missing athleteId" }, { status: 400 });
  }
  try {
    const imported = await syncAthlete(athleteId);
    return Response.json({ ok: true, imported });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    );
  }
}
