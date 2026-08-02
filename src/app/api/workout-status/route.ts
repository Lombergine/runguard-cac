import { resolveAthlete } from "@/lib/apiAuth";
import { getSql } from "@/lib/db";

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
  const sql = getSql();
  if (clearing) {
    await sql`delete from workout_status where athlete_id = ${athlete.id} and date = ${date}`;
  } else {
    await sql`
      insert into workout_status (athlete_id, date, status) values (${athlete.id}, ${date}, ${status})
      on conflict (athlete_id, date) do update set status = excluded.status`;
  }
  return Response.json({ ok: true });
}
