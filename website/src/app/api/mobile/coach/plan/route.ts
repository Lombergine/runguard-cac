import { resolveCoachTeam } from "@/lib/apiAuth";
import { localDay } from "@/lib/day";
import { getTeam, teamPlanDays, upsertTeamPlanDay } from "@/lib/db";
import { parsePlanDay } from "@/lib/teamPlan";

/** Four weeks at a time, same block the web calendar shows. */
const WEEKS = 4;

/**
 * The team's training calendar, for the coach's Calendar tab.
 *
 * The window mirrors `/dashboard/plan`: four weeks starting on a Monday, with
 * `?week=` shifting it by whole weeks and bounded to roughly a year either way
 * so a stray value cannot ask the database for a millennium-wide scan.
 *
 * Dates are computed here, on the server, exactly as the web page computes
 * them, so the phone and the browser never disagree about which week it is for
 * the seven hours a day that UTC and Pacific are on different dates.
 *
 * UNITS: metres, matching `/api/mobile/activity/[id]` — every mobile payload
 * ships the stored base unit and the app converts at the boundary. The web page
 * hands its client component miles because that is what its inputs take; that
 * is a UI decision, not a wire format.
 *
 * Only days a coach actually wrote come back. A date with no entry is absent
 * from `days`, and that is not the same as a rest day — RunGuard's own
 * suggestion fills a blank per athlete. A blank must never read as a value.
 *
 * Scoped by `teamPlanDays(teamId, ...)` in the statement itself, so there is no
 * id in this request that could point at another team's calendar.
 */
export async function GET(request: Request) {
  const teamId = await resolveCoachTeam(request);
  if (teamId == null) {
    return Response.json({ error: "Invalid coach token" }, { status: 401 });
  }

  const raw = Number(new URL(request.url).searchParams.get("week"));
  const offset = Number.isInteger(raw) && raw >= -52 && raw <= 52 ? raw : 0;

  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);

  const dates: string[] = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(localDay(d));
  }

  const written = await teamPlanDays(teamId, dates[0], dates[dates.length - 1]);

  return Response.json({
    weeks: WEEKS,
    from: dates[0],
    to: dates[dates.length - 1],
    days: dates
      .map((date) => ({ date, row: written.get(date) }))
      .filter((x) => x.row !== undefined)
      .map(({ date, row }) => ({
        date,
        type: row!.type,
        distanceM: row!.distance_m,
        targetPace: row!.target_pace,
        details: row!.details,
        why: row!.why,
        updatedAt: row!.updated_at,
        updatedBy: row!.updated_by,
      })),
  });
}

/**
 * Write one training day, from the coach's phone.
 *
 * The phone's Calendar tab could read the team plan and not change it, so a
 * coach standing on the track could see Thursday and not fix it. This is the
 * writer, and it is deliberately the same write the web page makes: same
 * validation (`parsePlanDay`, shared with `/api/team-plan`), same units (miles
 * on the wire, metres in the column), same upsert, same `updated_by`. A second
 * set of rules for the phone would mean the two clients could store days the
 * other would have refused, and the athlete would see whichever won.
 *
 * TEAM-SCOPED BY THE TOKEN. `resolveCoachTeam` returns the team the HMAC names,
 * and that value — never anything from the body — is what goes into the row.
 * There is no `teamId` field to send, so there is nothing to point at another
 * team's calendar. An athlete session token fails `verifyCoachToken` and gets
 * the same 401 as no token at all; the two kinds sign different strings.
 *
 * ONE DAY PER CALL, matching the web writer. A bulk endpoint would need a
 * partial-failure story, and "some of your week saved" is the shape of bug that
 * leaves a coach believing they planned a session they did not.
 */
export async function POST(request: Request) {
  const teamId = await resolveCoachTeam(request);
  if (teamId == null) {
    return Response.json({ error: "Invalid coach token" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = parsePlanDay(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const team = await getTeam(teamId);

  await upsertTeamPlanDay({
    team_id: teamId,
    ...parsed.value,
    updated_by: team?.coach_name ?? null,
  });

  // Echo the stored day back in the shape GET emits, so the app can update the
  // row it just edited without a second round trip — and so a unit mistake shows
  // up immediately as metres rather than a fortnight later on the athlete's
  // screen.
  return Response.json({
    ok: true,
    day: {
      date: parsed.value.date,
      type: parsed.value.type,
      distanceM: parsed.value.distance_m,
      targetPace: parsed.value.target_pace,
      details: parsed.value.details,
      why: parsed.value.why,
    },
  });
}
