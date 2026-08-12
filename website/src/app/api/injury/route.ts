import { localDay } from "@/lib/day";
import { resolveAthlete } from "@/lib/apiAuth";
import { run } from "@/lib/db/driver";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  // `.trim()` before the emptiness test: `{bodyPart: "   "}` used to store an
  // injury against three spaces, which the body scan can never light up and no
  // list can label.
  const bodyPart = typeof body.bodyPart === "string" ? body.bodyPart.trim().slice(0, 60) : "";
  if (!bodyPart) return Response.json({ error: "Need bodyPart" }, { status: 400 });

  // A malformed date used to fall through to `localDay()` — so a mistyped date
  // silently filed the injury under today and answered `{ok: true}`. An absent
  // date still means today; that is the documented default, not a guess at what
  // a broken one meant.
  if (body.date !== undefined && body.date !== null) {
    if (typeof body.date !== "string" || !ISO_DAY.test(body.date)) {
      return Response.json({ error: "Date must be YYYY-MM-DD." }, { status: 400 });
    }
  }
  const date = typeof body.date === "string" ? body.date : localDay();

  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
    return Response.json({ error: "Note must be text." }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) || null : null;

  await run(
    "INSERT INTO injuries (athlete_id, date, body_part, note) VALUES (?, ?, ?, ?)",
    [athlete.id, date, bodyPart, note]
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

  // The old test was `body.resolved === false ? null : <resolve it>`, so EVERY
  // value that was not the literal `false` — including `0` and the string
  // `"false"`, both of which a form or a query string will happily produce —
  // fell into the else branch and CLOSED the injury. A caller asking to reopen
  // one got it marked healed, and `{ok: true}` for it. Reopening is now
  // something you say, not something you can miss by a type.
  if (body.resolved !== undefined && typeof body.resolved !== "boolean") {
    return Response.json({ error: "resolved must be true or false." }, { status: 400 });
  }
  if (body.resolvedAt !== undefined && body.resolvedAt !== null) {
    if (typeof body.resolvedAt !== "string" || !ISO_DAY.test(body.resolvedAt)) {
      return Response.json({ error: "resolvedAt must be YYYY-MM-DD." }, { status: 400 });
    }
  }

  const resolvedAt =
    body.resolved === false
      ? null
      : typeof body.resolvedAt === "string"
        ? body.resolvedAt
        : localDay();

  // athlete_id in the WHERE keeps a coach from editing another athlete's record.
  // A row belonging to somebody else and a row that does not exist both land on
  // the same 404, so this cannot be used to probe which injury ids are real.
  const changes = await run(
    "UPDATE injuries SET resolved_at = ? WHERE id = ? AND athlete_id = ?",
    [resolvedAt, id, athlete.id]
  );
  if (changes === 0) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, resolvedAt });
}
