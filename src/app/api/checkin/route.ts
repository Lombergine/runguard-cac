import { resolveAthlete } from "@/lib/apiAuth";
import { upsertCheckin, upsertCheckinSoreness, clearCheckinSoreness } from "@/lib/db";

function num(v: unknown, lo: number, hi: number): number | null {
  return typeof v === "number" && v >= lo && v <= hi ? v : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  const date = new Date().toISOString().slice(0, 10);
  upsertCheckin({
    athlete_id: athlete.id,
    date,
    rpe: num(body.rpe, 1, 10),
    energy: num(body.energy, 1, 10),
    motivation: num(body.motivation, 1, 10),
    academic_stress:
      typeof body.academicStress === "boolean" ? (body.academicStress ? 1 : 0) : null,
  });

  if (typeof body.sorenessPart === "string" && body.sorenessPart.trim()) {
    const bodyPart = body.sorenessPart.slice(0, 60);
    const severity = num(body.sorenessSeverity, 0, 10);
    if (severity === null) {
      clearCheckinSoreness({ athlete_id: athlete.id, date, body_part: bodyPart });
    } else {
      upsertCheckinSoreness({ athlete_id: athlete.id, date, body_part: bodyPart, severity });
    }
  }
  return Response.json({ ok: true });
}
