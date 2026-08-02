import { resolveAthlete } from "@/lib/apiAuth";
import { updateRace, deleteRace } from "@/lib/db";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raceId = Number(id);
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });
  if (!Number.isInteger(raceId)) return Response.json({ error: "Invalid race id" }, { status: 400 });

  const patch: Record<string, string | number> = {};
  if (typeof body.name === "string") patch.name = body.name.slice(0, 120);
  if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) patch.date = body.date;
  if (typeof body.event === "string") patch.event = body.event.slice(0, 20);
  if (typeof body.distanceM === "number" && body.distanceM > 0) patch.distance_m = body.distanceM;
  if (typeof body.location === "string") patch.location = body.location.slice(0, 120);

  const ok = await updateRace(raceId, athlete.id, patch);
  if (!ok) return Response.json({ error: "Not found or not yours to edit" }, { status: 403 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const raceId = Number(id);
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });
  if (!Number.isInteger(raceId)) return Response.json({ error: "Invalid race id" }, { status: 400 });

  const ok = await deleteRace(raceId, athlete.id);
  if (!ok) return Response.json({ error: "Not found or not yours to delete" }, { status: 403 });
  return Response.json({ ok: true });
}
