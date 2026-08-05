import { resolveAthlete } from "@/lib/apiAuth";
import { run } from "@/lib/db/driver";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  const event = typeof body.event === "string" ? body.event.slice(0, 20) : "";
  const target = typeof body.target === "number" && body.target > 0 ? body.target : null;
  if (!event || target === null) {
    return Response.json({ error: "Need event and target" }, { status: 400 });
  }
  await run(
    `INSERT INTO goals (athlete_id, event, target) VALUES (?, ?, ?)
     ON CONFLICT(athlete_id, event) DO UPDATE SET target = excluded.target`,
    [athlete.id, event, target]
  );
  return Response.json({ ok: true });
}
