import { resolveAthlete } from "@/lib/apiAuth";
import { upsertCheckin } from "@/lib/db";

function num(v: unknown, lo: number, hi: number): number | null {
  return typeof v === "number" && v >= lo && v <= hi ? v : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  upsertCheckin({
    athlete_id: athlete.id,
    date: new Date().toISOString().slice(0, 10),
    rpe: num(body.rpe, 1, 10),
    soreness_part: typeof body.sorenessPart === "string" ? body.sorenessPart.slice(0, 60) : null,
    soreness_severity: num(body.sorenessSeverity, 0, 10),
    energy: num(body.energy, 1, 10),
    motivation: num(body.motivation, 1, 10),
    academic_stress:
      typeof body.academicStress === "boolean" ? (body.academicStress ? 1 : 0) : null,
  });
  return Response.json({ ok: true });
}
