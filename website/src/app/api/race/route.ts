import { localDay } from "@/lib/day";
import { resolveAthlete } from "@/lib/apiAuth";
import { createRace } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  const name = typeof body.name === "string" ? body.name.slice(0, 120) : "";
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : "";
  const event = typeof body.event === "string" ? body.event.slice(0, 20) : "";
  const distanceM = typeof body.distanceM === "number" && body.distanceM > 0 ? body.distanceM : null;
  const location = typeof body.location === "string" ? body.location.slice(0, 120) : null;

  const missing: string[] = [];
  if (!name) missing.push("race name");
  if (!date) missing.push("a valid date");
  if (!event) missing.push("event");
  if (distanceM === null) missing.push("distance");
  if (missing.length) {
    return Response.json({ error: `Please fill in: ${missing.join(", ")}.` }, { status: 400 });
  }
  if (date < localDay()) {
    return Response.json({ error: "That race date is in the past — pick an upcoming date." }, { status: 400 });
  }

  const race = await createRace({
    name,
    date,
    event,
    distance_m: distanceM,
    location,
    created_by_athlete_id: athlete.id,
    team_id: athlete.team_id,
  });
  return Response.json({ ok: true, race });
}
