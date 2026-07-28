import { resolveAthlete } from "@/lib/apiAuth";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  const date = typeof body.date === "string" ? body.date.slice(0, 10) : "";
  const status = ["done", "modified", "skipped"].includes(body.status) ? body.status : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !status) {
    return Response.json({ error: "Need date + status (done|modified|skipped)" }, { status: 400 });
  }
  getDb()
    .prepare(
      `INSERT INTO workout_status (athlete_id, date, status) VALUES (?, ?, ?)
       ON CONFLICT(athlete_id, date) DO UPDATE SET status = excluded.status`
    )
    .run(athlete.id, date, status);
  return Response.json({ ok: true });
}
