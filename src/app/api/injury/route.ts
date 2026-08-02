import { localDay } from "@/lib/day";
import { resolveAthlete } from "@/lib/apiAuth";
import { getSql } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  const bodyPart = typeof body.bodyPart === "string" ? body.bodyPart.slice(0, 60) : "";
  if (!bodyPart) return Response.json({ error: "Need bodyPart" }, { status: 400 });
  const date =
    typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : localDay();
  const note = typeof body.note === "string" ? body.note.slice(0, 300) : null;
  await getSql()`
    insert into injuries (athlete_id, date, body_part, note)
    values (${athlete.id}, ${date}, ${bodyPart}, ${note})`;
  return Response.json({ ok: true });
}

/* mark an injury healed (or reopen it) — the body scan only lights unresolved ones */
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  const id = Number(body.id);
  if (!Number.isInteger(id)) return Response.json({ error: "Need id" }, { status: 400 });

  const resolvedAt =
    body.resolved === false
      ? null
      : typeof body.resolvedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.resolvedAt)
        ? body.resolvedAt
        : localDay();

  // athlete_id in the WHERE keeps a coach from editing another athlete's record
  const res = await getSql()`
    update injuries set resolved_at = ${resolvedAt}
    where id = ${id} and athlete_id = ${athlete.id}`;
  if (res.count === 0) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, resolvedAt });
}
