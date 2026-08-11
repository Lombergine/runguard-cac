import { localDay } from "@/lib/day";
import { resolveAthlete } from "@/lib/apiAuth";
import { upsertCheckin, upsertCheckinSoreness, clearCheckinSoreness } from "@/lib/db";

function num(v: unknown, lo: number, hi: number): number | null {
  return typeof v === "number" && v >= lo && v <= hi ? v : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  const date = localDay();
  await upsertCheckin({
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
    const raw = body.sorenessSeverity;

    // `null` CLEARS this part. Anything else that is not a real 0–10 is a bad
    // request and is refused.
    //
    // This used to be `num(raw, 0, 10)` with `null` meaning clear, which folded
    // "clear this" and "that value is nonsense" into the same branch — so
    // `{sorenessSeverity: 11}` DELETED the athlete's score and answered
    // `{ok: true}`. `JSON.stringify` emits `null` for `NaN`, so
    // `Number(someUnparseableField)` did the same thing. A client cannot tell
    // the difference between a save and a silent destruction, which is exactly
    // how this project lost a soreness answer once already.
    //
    // Clearing is now something a caller has to ASK for, not something they can
    // fall into.
    if (raw === null) {
      await clearCheckinSoreness({ athlete_id: athlete.id, date, body_part: bodyPart });
    } else if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 10) {
      await upsertCheckinSoreness({
        athlete_id: athlete.id,
        date,
        body_part: bodyPart,
        severity: raw,
      });
    } else {
      return Response.json(
        { error: "Soreness severity must be a whole number from 0 to 10, or null to clear it." },
        { status: 400 }
      );
    }
  }
  return Response.json({ ok: true });
}
