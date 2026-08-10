import { syncAthlete } from "@/lib/strava";
import { resolveAthlete } from "@/lib/apiAuth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athleteId = Number(body.athleteId);
  if (!Number.isInteger(athleteId)) {
    return Response.json({ error: "Missing athleteId" }, { status: 400 });
  }
  // Was isLoggedIn() alone, which asked only whether A coach session existed and
  // then synced whatever athlete id it was handed, on any team.
  if (!(await resolveAthlete(request, athleteId))) {
    return Response.json({ error: "Not authorized" }, { status: 401 });
  }
  const dateSec = (s: unknown) =>
    typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
      ? Math.floor(new Date(s + "T00:00:00Z").getTime() / 1000)
      : undefined;
  const after = dateSec(body.startDate);
  const before = dateSec(body.endDate);
  try {
    const imported = await syncAthlete(athleteId, after !== undefined ? { after, before } : {});
    return Response.json({ ok: true, imported });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    );
  }
}
