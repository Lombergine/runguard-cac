import { resolveAthlete } from "@/lib/apiAuth";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  const event = typeof body.event === "string" ? body.event.slice(0, 20) : "";
  const timeS = typeof body.timeS === "number" && body.timeS > 30 && body.timeS < 7200 ? body.timeS : null;
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : new Date().toISOString().slice(0, 10);
  if (!event || timeS === null) {
    return Response.json({ error: "Need event and timeS (seconds)" }, { status: 400 });
  }
  getDb()
    .prepare(
      `INSERT INTO race_results (athlete_id, event, date, time_s, place, feel, conditions)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      athlete.id,
      event,
      date,
      timeS,
      typeof body.place === "number" ? body.place : null,
      ["great", "ok", "rough"].includes(body.feel) ? body.feel : null,
      typeof body.conditions === "string" ? body.conditions.slice(0, 120) : null
    );
  return Response.json({ ok: true });
}
