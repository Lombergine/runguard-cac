import { resolveAthlete } from "@/lib/apiAuth";
import { setAthleteHrMax } from "@/lib/db";
import { HR_MAX_MIN, HR_MAX_MAX } from "@/lib/hrmax";

/**
 * Set an athlete's max heart rate, or clear it back to automatic.
 *
 * POST { hrMax: 192, source?: 'manual' | 'calibrated' }  → store it
 * POST { hrMax: null }                                   → clear, resolve automatically
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  if (body.hrMax === null) {
    await setAthleteHrMax(athlete.id, null, null);
    return Response.json({ ok: true, cleared: true });
  }

  const value = typeof body.hrMax === "number" ? Math.round(body.hrMax) : NaN;
  if (!Number.isFinite(value) || value < HR_MAX_MIN || value > HR_MAX_MAX) {
    return Response.json(
      { error: `Enter a max heart rate between ${HR_MAX_MIN} and ${HR_MAX_MAX} bpm.` },
      { status: 400 }
    );
  }

  // `source` is provenance the UI shows as a label ("manual" vs "calibrated"),
  // so quietly rewriting an unrecognised one to "manual" would attribute the
  // number to something the caller never claimed.
  if (body.source !== undefined && body.source !== "manual" && body.source !== "calibrated") {
    return Response.json(
      { error: "source must be 'manual' or 'calibrated'." },
      { status: 400 }
    );
  }
  const source = body.source === "calibrated" ? "calibrated" : "manual";
  await setAthleteHrMax(athlete.id, value, source);
  return Response.json({ ok: true, hrMax: value, source });
}
