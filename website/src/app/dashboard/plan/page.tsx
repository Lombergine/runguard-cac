import { localDay } from "@/lib/day";
import { currentTeamId } from "@/lib/session";
import { getTeam, teamPlanDays, athletesForTeam } from "@/lib/db";
import PlanCalendar from "./PlanCalendar";

export const dynamic = "force-dynamic";

const WEEKS = 4;

/**
 * The coach's training calendar.
 *
 * Four weeks at a time, starting from a Monday, because a season is planned in
 * blocks and a single week is not enough to see a build or a taper taking shape.
 * `?week=` shifts the window by whole weeks; it is bounded so a stray value in
 * the URL cannot ask the database for a window a thousand years wide.
 *
 * The days are computed here, on the server, and handed down as ISO strings.
 * Building the grid in the browser instead would mean the server and the
 * athlete's laptop could disagree about what week it is for the seven hours a
 * day that UTC and Pacific are on different dates.
 */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const rawOffset = Number(sp.week);
  // Roughly a year either way. Enough to plan a season, not enough to be a way
  // of asking for an unbounded scan.
  const offset =
    Number.isInteger(rawOffset) && rawOffset >= -52 && rawOffset <= 52 ? rawOffset : 0;

  const teamId = await currentTeamId();
  const team = teamId ? await getTeam(teamId) : null;
  const roster = teamId ? await athletesForTeam(teamId) : [];

  // This week's Monday, then shifted by whole weeks.
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);

  const dates: string[] = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(localDay(d));
  }

  const written = teamId
    ? await teamPlanDays(teamId, dates[0], dates[dates.length - 1])
    : new Map();

  // Plain objects across the server/client boundary — a Map does not serialise.
  const days = dates.map((date) => {
    const w = written.get(date);
    return {
      date,
      type: w?.type ?? null,
      distanceMi: w?.distance_m != null ? Math.round((w.distance_m / 1609.344) * 10) / 10 : null,
      targetPace: w?.target_pace ?? null,
      details: w?.details ?? null,
      why: w?.why ?? null,
      updatedBy: w?.updated_by ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Training calendar</h1>
          <p className="text-sm mt-1 max-w-2xl leading-relaxed" style={{ color: "var(--ink-muted)" }}>
            {team ? `${team.name} · ` : ""}
            Click any day and write the session. It appears on every athlete&apos;s
            Training tab the moment you save — {roster.length} runner
            {roster.length === 1 ? "" : "s"} right now. Days you leave blank keep
            RunGuard&apos;s own suggestion, which adapts to each athlete individually.
          </p>
        </div>
      </div>

      <PlanCalendar days={days} weekOffset={offset} today={localDay()} />

      <div
        className="rounded-2xl border p-5 text-sm leading-relaxed"
        style={{ borderColor: "var(--hairline)", background: "var(--surface)", color: "var(--ink-2)" }}
      >
        <p>
          <b>What your athletes see.</b> A day you write here replaces RunGuard&apos;s
          suggestion for everyone on the team, and it is labelled as coming from you —
          including during race week, where your session overrides the automatic taper.
        </p>
        <p className="mt-2">
          The one thing that still adapts is distance. If an athlete&apos;s readiness is
          low, or they reported the same spot sore several days running, their copy shows
          your distance <i>and</i> an eased one beside it, with the reason. They always
          see the number you wrote.
        </p>
      </div>
    </div>
  );
}
