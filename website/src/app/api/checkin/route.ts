import { localDay } from "@/lib/day";
import { resolveAthlete } from "@/lib/apiAuth";
import { upsertCheckin, upsertCheckinSoreness, clearCheckinSoreness } from "@/lib/db";

/**
 * ABSENT, VALID and BAD are three different answers, and folding any two of them
 * together is how this route has now lost data twice.
 *
 * The old helper was `num(v, lo, hi)` and it returned `null` both for a field
 * that was never sent and for a field that was sent as nonsense. `upsertCheckin`
 * COALESCEs `null` to "keep whatever is already stored", so `{rpe: 99}` wrote
 * nothing and the route still answered `{ok: true}` — a receipt for a number the
 * server never took. Worse, a same-day correction was silently refused: an
 * athlete who put 7 and then meant to change it kept the 7. And because
 * `JSON.stringify` puts `NaN` on the wire as `null`, a client doing
 * `energy: Number(field)` over an unparseable entry landed in the same branch.
 *
 * This is the same collapse the soreness block below documents, in the same
 * handler, and it is fixed the same way: NOT SENT leaves the stored value alone,
 * SENT AND UNUSABLE is a 400. Nothing is ever discarded behind an `{ok: true}`.
 *
 * Deliberately `Number.isFinite` rather than `Number.isInteger`: the stored
 * column is REAL and existing rows hold values like 5.7, so a whole-number rule
 * here would reject data the app already treats as valid. The range is the only
 * claim being made.
 */
const BAD = Symbol("bad");

function score(v: unknown, lo: number, hi: number): number | null | typeof BAD {
  if (v === undefined) return null; // not sent — leave whatever is stored
  return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : BAD;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const athlete = await resolveAthlete(request, body.athleteId ?? null);
  if (!athlete) return Response.json({ error: "Not authorized" }, { status: 401 });

  /* ---- validate everything BEFORE writing anything ---- */

  const rpe = score(body.rpe, 1, 10);
  const energy = score(body.energy, 1, 10);
  const motivation = score(body.motivation, 1, 10);
  const academicStress =
    body.academicStress === undefined
      ? null
      : typeof body.academicStress === "boolean"
        ? body.academicStress
          ? 1
          : 0
        : BAD;

  const bad = ([
    ["energy", energy],
    ["RPE", rpe],
    ["motivation", motivation],
  ] as const)
    .filter(([, v]) => v === BAD)
    .map(([k]) => k);
  if (bad.length) {
    return Response.json(
      { error: `Enter ${bad.join(" and ")} as a number from 1 to 10.` },
      { status: 400 }
    );
  }
  if (academicStress === BAD) {
    return Response.json(
      { error: "Academic stress must be true or false." },
      { status: 400 }
    );
  }

  const hasPart = typeof body.sorenessPart === "string" && body.sorenessPart.trim().length > 0;
  const bodyPart = hasPart ? body.sorenessPart.trim().slice(0, 60) : null;
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
  const clearing = hasPart && raw === null;
  const severity =
    hasPart && !clearing && typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 10
      ? raw
      : null;
  if (hasPart && !clearing && severity === null) {
    return Response.json(
      { error: "Soreness severity must be a whole number from 0 to 10, or null to clear it." },
      { status: 400 }
    );
  }

  const hasScores =
    rpe !== null || energy !== null || motivation !== null || academicStress !== null;
  if (!hasScores && !hasPart) {
    return Response.json(
      { error: "Nothing to record — send a score, or a soreness part and severity." },
      { status: 400 }
    );
  }

  /* ---- writes ---- */

  const date = localDay();

  // Only when the athlete actually reported something. A bare `upsertCheckin`
  // on every call INSERTed a `checkins` row with every self-report column NULL,
  // and a row EXISTING is not the athlete having said anything: that empty row
  // satisfied the old `todayCheckin !== null` gate and printed "Readiness
  // 100/100 · Good to go" over three tiles reading "Not recorded". The gate was
  // narrowed to ask what the row CONTAINS, but the route should not be
  // manufacturing the empty row in the first place — and it did so even for
  // requests it went on to REJECT, because the write ran before validation.
  //
  // A soreness-only call still gets its parent row: `upsertCheckinSoreness`
  // creates one itself, because `checkin_soreness.checkin_id` needs it.
  if (hasScores) {
    await upsertCheckin({
      athlete_id: athlete.id,
      date,
      rpe: rpe as number | null,
      energy: energy as number | null,
      motivation: motivation as number | null,
      academic_stress: academicStress as number | null,
    });
  }

  if (bodyPart) {
    if (clearing) {
      await clearCheckinSoreness({ athlete_id: athlete.id, date, body_part: bodyPart });
    } else {
      await upsertCheckinSoreness({
        athlete_id: athlete.id,
        date,
        body_part: bodyPart,
        severity: severity as number,
      });
    }
  }

  return Response.json({ ok: true });
}
