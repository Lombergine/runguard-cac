import { resolveAthlete } from "@/lib/apiAuth";
import { updateRace, deleteRace } from "@/lib/db";

/**
 * `params` is a Promise in this version of Next and must be awaited — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md.
 *
 * Both handlers answer 403 with the SAME sentence for a race that does not
 * exist and for one belonging to somebody else, so neither can be used to probe
 * which race ids are real. `app/src/lib/api.ts` documents that 403 as the
 * contract the athlete app renders against ("coach- and seed-created races are
 * on the athlete's calendar but not theirs to delete"), so it stays 403 rather
 * than becoming 404.
 */
function raceId(id: string): number | null {
  // Decimal digits only. `Number()` alone accepts "1e3", "0x10" and " 4 ".
  return /^\d+$/.test(id) ? Number(id) : null;
}

/**
 * Every field was previously written as `if (<valid>) patch.x = ...`, so a value
 * the caller SENT and got wrong was skipped and the route still answered
 * `{ok: true}`: `{date: "not-a-date"}`, `{distanceM: -5}` and `{distanceM: "5000"}`
 * all changed nothing and reported success, and a PATCH whose every field was
 * unrecognised — `{}` included — did the same. `{name: ""}` was worse than
 * silent: it passed the `typeof === "string"` test and WIPED the race's name.
 *
 * A field that is present and unusable is now a 400, and a PATCH that would
 * change nothing says so instead of claiming it worked.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  const rid = raceId(id);
  if (rid === null) return Response.json({ error: "Invalid race id" }, { status: 400 });

  const patch: Record<string, string | number> = {};
  const bad: string[] = [];

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) bad.push("a race name");
    else patch.name = name;
  }
  if (body.date !== undefined) {
    if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) patch.date = body.date;
    else bad.push("a date as YYYY-MM-DD");
  }
  if (body.event !== undefined) {
    const event = typeof body.event === "string" ? body.event.trim().slice(0, 20) : "";
    if (!event) bad.push("an event");
    else patch.event = event;
  }
  if (body.distanceM !== undefined) {
    if (typeof body.distanceM === "number" && Number.isFinite(body.distanceM) && body.distanceM > 0)
      patch.distance_m = body.distanceM;
    else bad.push("a distance in metres above 0");
  }
  if (body.location !== undefined) {
    if (typeof body.location === "string") patch.location = body.location.trim().slice(0, 120);
    else bad.push("a location as text");
  }

  if (bad.length) {
    return Response.json({ error: `Please give ${bad.join(", ")}.` }, { status: 400 });
  }
  if (!Object.keys(patch).length) {
    return Response.json({ error: "Nothing to change." }, { status: 400 });
  }

  const ok = await updateRace(rid, athlete.id, patch);
  if (!ok) return Response.json({ error: "Not found or not yours to edit" }, { status: 403 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  const rid = raceId(id);
  if (rid === null) return Response.json({ error: "Invalid race id" }, { status: 400 });

  // `deleteRace` re-reads the row and compares `created_by_athlete_id` itself,
  // so the scope check is not something this handler can forget to apply.
  const ok = await deleteRace(rid, athlete.id);
  if (!ok) return Response.json({ error: "Not found or not yours to delete" }, { status: 403 });
  return Response.json({ ok: true });
}
