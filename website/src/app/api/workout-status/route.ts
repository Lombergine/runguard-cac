import { resolveAthlete } from "@/lib/apiAuth";
import { run } from "@/lib/db/driver";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  const date = typeof body.date === "string" ? body.date.slice(0, 10) : "";
  const validStatuses = ["done", "modified", "skipped"];
  const clearing = body.status === null;
  const status = validStatuses.includes(body.status) ? body.status : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (!status && !clearing)) {
    return Response.json({ error: "Need date + status (done|modified|skipped|null)" }, { status: 400 });
  }
  if (clearing) {
    await run("DELETE FROM workout_status WHERE athlete_id = ? AND date = ?", [athlete.id, date]);
  } else {
    await run(
      `INSERT INTO workout_status (athlete_id, date, status) VALUES (?, ?, ?)
       ON CONFLICT(athlete_id, date) DO UPDATE SET status = excluded.status`,
      [athlete.id, date, status]
    );
  }
  return Response.json({ ok: true });
}
