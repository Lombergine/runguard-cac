import { localDay } from "@/lib/day";
import { resolveAthlete } from "@/lib/apiAuth";
import { run } from "@/lib/db/driver";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  const bodyPart = typeof body.bodyPart === "string" ? body.bodyPart.slice(0, 60) : "";
  if (!bodyPart) return Response.json({ error: "Need bodyPart" }, { status: 400 });
  await run(
    "INSERT INTO injuries (athlete_id, date, body_part, note) VALUES (?, ?, ?, ?)",
    [
      athlete.id,
      typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : localDay(),
      bodyPart,
      typeof body.note === "string" ? body.note.slice(0, 300) : null,
    ]
  );
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
  const changes = await run(
    "UPDATE injuries SET resolved_at = ? WHERE id = ? AND athlete_id = ?",
    [resolvedAt, id, athlete.id]
  );
  if (changes === 0) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, resolvedAt });
}
