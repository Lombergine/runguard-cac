import { Suspense } from "react";
import { localDayOffset } from "@/lib/day";
import { miNum } from "@/lib/units";
import Link from "next/link";
import { athletesForTeam, getTeam, activitiesForAthlete, metricsForAthlete, sorenessHistory, teamPlanDays } from "@/lib/db";
import { computeRisk, sessionSpike, type RiskSnapshot, type SessionSpike } from "@/lib/risk";
import { computeFitness } from "@/lib/engine";
import { currentTeamId } from "@/lib/session";
import { parseRange, fetchDays } from "@/lib/range";
import Avatar from "@/components/Avatar";
import { LoadSpark } from "@/components/charts";
import InviteCard from "./InviteCard";
import RangePicker from "./RangePicker";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const range = parseRange((await searchParams).range);
  const teamId = await currentTeamId();
  const team = teamId ? await getTeam(teamId) : null;
  // Reading the clock IS the intent here. This is an async Server Component
  // marked force-dynamic, so it re-runs per request and Date.now() is the
  // request time; there is no purer source for it. The rule targets client
  // renders that must be replayable, which this is not.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  // Read wide enough for the chosen window AND the equal window before it, plus
  // the 28-day chronic baseline the risk engine builds off the same array. See
  // fetchDays(): a short window must not starve ACWR.
  const since = new Date(nowMs - fetchDays(range) * 86400000).toISOString();
  const rangeStart = new Date(nowMs - range.days * 86400000).toISOString();
  const prevRangeStart = new Date(nowMs - range.days * 2 * 86400000).toISOString();
  const soreSince = localDayOffset(13, new Date(nowMs));
  // Today and tomorrow off the team calendar, for the strip below the header.
  // Two days, not seven: this is the "what are we doing" glance before practice,
  // and the full picture is one click away on /dashboard/plan.
  const todayIso = localDayOffset(0, new Date(nowMs));
  const tomorrowIso = localDayOffset(-1, new Date(nowMs));
  const planAhead = teamId ? await teamPlanDays(teamId, todayIso, tomorrowIso) : new Map();
  // Fail closed rather than falling back to every athlete in the database.
  const roster = teamId ? await athletesForTeam(teamId) : [];
  const athletes = await Promise.all(roster.map(async (a) => {
    const acts = await activitiesForAthlete(a.id, since);
    const metrics = await metricsForAthlete(a.id, since);
    // the roster is the coach's triage screen — it has to see what athletes
    // reported, not just what their watches recorded
    const sore = (await sorenessHistory(a.id, soreSince)).map((s) => ({
      date: s.date,
      body_part: s.body_part,
      severity: s.severity,
    }));
    const risk = computeRisk(acts, metrics, new Date(nowMs), sore, a);
    const fitness = computeFitness(risk, metrics, acts);
    // Distance over the window the coach picked, and over the equally long
    // window immediately before it. Computed here rather than taken from
    // risk.weekKm, which is fixed at 7 days by definition and must stay that
    // way — ACWR is only meaningful on its own windows.
    const km = (from: string, to?: string) =>
      acts
        .filter((x) => x.start_time >= from && (to === undefined || x.start_time < to))
        .reduce((sum, x) => sum + x.distance_m / 1000, 0);
    const rangeKm = km(rangeStart);
    const prevRangeKm = km(prevRangeStart, rangeStart);
    // most recent run that was markedly longer than anything before it
    const spikeRun = [...acts]
      .sort((x, y) => y.start_time.localeCompare(x.start_time))
      .slice(0, 7)
      .map((x) => ({ at: x.start_time, spike: sessionSpike(x, acts) }))
      .find((x) => x.spike !== null);
    return { a, risk, fitness, spike: spikeRun?.spike ?? null, rangeKm, prevRangeKm };
  }));
  // Alphabetical, deliberately. Ranking minors by an injury-risk number teaches
  // them to inflate their check-ins to avoid being at the top of it — which
  // corrupts self-report, the most sensitive signal in the whole system.
  athletes.sort((x, y) => x.a.name.localeCompare(y.a.name));

  const spikes = athletes.filter((x) => x.spike !== null).length;
  const sore = athletes.filter(
    (x) => x.risk.selfReport.persistentPart && x.risk.selfReport.persistentDays >= 3
  ).length;
  const quiet = athletes.filter(
    (x) => !x.risk.selfReport.hasData || (x.risk.selfReport.daysSinceReport ?? 0) >= 5
  ).length;
  const teamKm = athletes.reduce((s, x) => s + x.rangeKm, 0);
  const teamPrevKm = athletes.reduce((s, x) => s + x.prevRangeKm, 0);
  // Null, not 0. With no distance in the previous window there is no percentage
  // to state, and printing "+0%" there claims the team held steady when the
  // truth is that nothing was recorded to compare against.
  const teamDelta =
    teamPrevKm > 0 ? Math.round(((teamKm - teamPrevKm) / teamPrevKm) * 100) : null;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Before practice today</h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
            {team ? `${team.name} · ` : ""}{today} · {athletes.length} athlete{athletes.length === 1 ? "" : "s"} tracked
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/*
            Suspense around RangePicker because it reads useSearchParams. This
            page is force-dynamic so it is never prerendered, but Next still
            prerenders the error and not-found shells that wrap it, and an
            unsuspended useSearchParams there fails the build rather than the
            request — a failure that would only appear at deploy time, which is
            the worst moment to find it. The fallback is a same-size blank so
            the header does not jump.
          */}
          <Suspense fallback={<div style={{ width: 190, height: 38 }} />}>
            <RangePicker />
          </Suspense>
          {team && <InviteCard joinCode={team.join_code} />}
        </div>
      </div>

      {/*
        Today's session, straight off the team calendar. The coach's own note
        asked for the calendar to reach "the home screen dashboard" — this is
        that, and it doubles as the empty-state prompt for a coach who has not
        written anything yet.
      */}
      <TodaysSession
        today={planAhead.get(todayIso) ?? null}
        tomorrow={planAhead.get(tomorrowIso) ?? null}
      />

      {athletes.length === 0 && (
        <div
          className="rounded-2xl border p-8 text-center enter"
          style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
        >
          <div className="text-lg font-semibold">Your roster is empty — for now</div>
          <p className="text-sm mt-2 max-w-md mx-auto" style={{ color: "var(--ink-muted)" }}>
            Share your team code with your athletes. When they sign up with it, they show up here
            automatically — risk-ranked, the moment their watch syncs.
          </p>
          {team && (
            <div className="mt-4 inline-block rounded-xl border px-6 py-3" style={{ borderColor: "var(--brand)", background: "color-mix(in oklab, var(--brand) 8%, var(--surface))" }}>
              <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>Team code</div>
              <div className="text-2xl font-extrabold tracking-wider" style={{ color: "var(--brand-strong)" }}>{team.join_code}</div>
            </div>
          )}
        </div>
      )}

      {/* stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Long-run spikes",
            value: String(spikes),
            accent: spikes > 0 ? "var(--status-warning)" : "var(--status-good)",
            sub: spikes > 0 ? "A run well past their usual" : "None this week",
          },
          {
            label: "Soreness patterns",
            value: String(sore),
            accent: sore > 0 ? "var(--status-warning)" : "var(--status-good)",
            sub: sore > 0 ? "Same spot, several days" : "Nothing recurring",
          },
          {
            label: `Team distance (${range.short})`,
            value: `${miNum(teamKm, 0)} mi`,
            accent: undefined as string | undefined,
            sub:
              teamDelta === null
                ? `Nothing recorded the ${range.short} before`
                : `${teamDelta >= 0 ? "+" : ""}${teamDelta}% vs the previous ${range.short}`,
          },
          {
            label: "Not checking in",
            value: String(quiet),
            accent: quiet > 0 ? "var(--ink-muted)" : "var(--status-good)",
            sub: quiet > 0 ? "No recent self-report" : "Everyone reporting",
          },
        ].map((t, i) => (
          <div key={t.label} className="enter" style={{ ["--i" as string]: i }}>
            <Tile label={t.label} value={t.value} accent={t.accent} sub={t.sub} />
          </div>
        ))}
      </div>

      {/* roster */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-xs uppercase tracking-wide"
              style={{ color: "var(--ink-muted)" }}
            >
              <th className="px-4 py-3 font-medium">Athlete</th>
              <th className="px-3 py-3 font-medium">Needs a look</th>
              <th className="px-3 py-3 font-medium text-right">{range.short} mi</th>
              <th className="px-3 py-3 font-medium hidden md:table-cell w-36">Last 4 weeks</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {athletes.map(({ a, risk, fitness, spike, rangeKm }) => (

              <tr
                key={a.id}
                className="border-t transition-colors hover:bg-black/[0.03]"
                style={{
                  borderColor: "var(--hairline)",
                  boxShadow: `inset 3px 0 0 ${
                    spike || (risk.selfReport.persistentPart && risk.selfReport.persistentDays >= 3)
                      ? "var(--status-warning)"
                      : "transparent"
                  }`,
                }}
              >
                <td className="px-4 py-3">
                  <Link href={`/dashboard/athlete/${a.id}`} className="flex items-center gap-3">
                    <Avatar name={a.name} hue={a.avatar_hue} />
                    <span>
                      <span className="font-medium block leading-tight">{a.name}</span>
                      <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
                        Grade {a.grade} · {fitness.tier}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <RosterFlags self={risk.selfReport} spike={spike} />
                </td>
                <td className="px-3 py-3 text-right tabular-nums" style={{ color: "var(--ink-2)" }}>
                  {miNum(rangeKm)}
                </td>
                <td className="px-3 py-1 hidden md:table-cell">
                  <LoadSpark data={risk.series} />
                </td>
                <td className="px-3 py-3 text-right">
                  <Link
                    href={`/dashboard/athlete/${a.id}`}
                    className="text-xs font-medium hover:underline"
                    style={{ color: "var(--brand-strong)" }}
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
        The window above moves the distance figures. Soreness patterns stay on their own
        7-day lookback and acute:chronic workload stays 7-day vs 28-day — both are defined
        on fixed windows and would mean nothing rescaled. Numbers update as watches sync.
      </p>
    </div>
  );
}

/**
 * Everything on this row a coach could act on today — and nothing they can't.
 *
 * There is no score here by design. A ranked injury number taught athletes to
 * inflate their check-ins to stay off the top of it, which corrupted the most
 * sensitive signal in the system. These are specific, named, and tied either to
 * a session that already happened or to a pattern in what the athlete reported.
 *
 * A blank cell means nothing needs attention — not that the athlete is fine.
 * That distinction is why "no check-in" is itself one of the states.
 */
function RosterFlags({
  self,
  spike,
}: {
  self: RiskSnapshot["selfReport"];
  spike: SessionSpike | null;
}) {
  const persistent = self.persistentPart && self.persistentDays >= 3;
  const acute = !persistent && self.todayMax >= 6;
  const stale = self.hasData && (self.daysSinceReport ?? 0) >= 5;

  const rows: { text: string; color: string; title?: string }[] = [];

  if (spike) {
    rows.push({
      text: `\u26a0 ${miNum(spike.km)} mi run · ${spike.pctAbove}% over usual`,
      color: spike.level === "large" ? "var(--status-critical)" : "var(--status-warning)",
      title: `Longest run in the 30 days before it was ${miNum(spike.longestKm)} mi`,
    });
  }
  if (persistent) {
    rows.push({
      text: `\u26a0 ${self.persistentPart} · ${self.persistentDays}/7d${self.escalating ? " \u2191" : ""}`,
      color: "var(--status-warning)",
      title: `Reported sore on ${self.persistentDays} of the last 7 days, peak ${self.persistentPeak}/10`,
    });
  } else if (acute) {
    rows.push({
      text: `\u26a0 ${self.todayPart} · ${self.todayMax}/10 today`,
      color: "var(--status-critical)",
    });
  }
  if (!self.hasData) {
    rows.push({ text: "no check-ins", color: "var(--ink-muted)" });
  } else if (stale) {
    rows.push({ text: `no check-in · ${self.daysSinceReport}d`, color: "var(--ink-muted)" });
  }

  if (!rows.length) {
    return <span className="text-sm" style={{ color: "var(--ink-muted)" }}>—</span>;
  }

  return (
    <div className="space-y-0.5">
      {rows.map((r, i) => (
        <div key={i} className="text-[11px] font-medium" style={{ color: r.color }} title={r.title}>
          {r.text}
        </div>
      ))}
    </div>
  );
}

/**
 * What the team is doing today, per the coach's own calendar.
 *
 * Shows nothing invented. With no session written it says so and links to the
 * calendar, rather than displaying RunGuard's generated suggestion here — that
 * suggestion is per-athlete by design, so there is no single team answer to
 * print, and printing one athlete's would be misleading on a team screen.
 */
function TodaysSession({
  today,
  tomorrow,
}: {
  today: { type: string; distance_m: number | null; target_pace: string | null; details: string | null } | null;
  tomorrow: { type: string; distance_m: number | null } | null;
}) {
  const line = (d: { type: string; distance_m: number | null; target_pace?: string | null }) =>
    [d.type, d.distance_m != null ? `${miNum(d.distance_m / 1000)} mi` : null, d.target_pace]
      .filter(Boolean)
      .join(" · ");

  if (!today && !tomorrow) {
    return (
      <div
        className="rounded-2xl border p-5 flex flex-wrap items-center gap-x-4 gap-y-2"
        style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
      >
        <div className="flex-1 min-w-60">
          <div className="text-sm font-semibold">No session on the calendar today</div>
          <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
            Athletes are seeing RunGuard&apos;s own suggestion, adapted to each of them.
            Write your own and it replaces it for the whole team.
          </p>
        </div>
        <Link
          href="/dashboard/plan"
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-black"
          style={{ background: "var(--brand)" }}
        >
          Open the training calendar →
        </Link>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        borderColor: "var(--brand)",
        background: "color-mix(in oklab, var(--brand) 6%, var(--surface))",
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="micro-label" style={{ color: "var(--brand-strong)" }}>
          Today&apos;s session
        </div>
        <Link href="/dashboard/plan" className="text-xs hover:underline" style={{ color: "var(--brand-strong)" }}>
          Edit the calendar →
        </Link>
      </div>
      <div className="text-xl font-bold mt-1">
        {today ? line(today) : "Nothing written for today"}
      </div>
      {today?.details && (
        <p className="text-sm mt-1.5 leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {today.details}
        </p>
      )}
      {tomorrow && (
        <p className="text-xs mt-2.5" style={{ color: "var(--ink-muted)" }}>
          Tomorrow: {line(tomorrow)}
        </p>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
    >
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
        {label}
      </div>
      <div className="text-3xl font-bold mt-1" style={{ color: accent ?? "var(--ink)" }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
