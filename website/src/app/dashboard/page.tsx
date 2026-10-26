import { Suspense } from "react";
import Link from "next/link";
import { localDayOffset } from "@/lib/day";
import { miNum } from "@/lib/units";
import { getTeam, teamPlanDays } from "@/lib/db";
import TeamAuditPanel from "@/components/TeamAuditPanel";
import { buildTeamAudit } from "@/lib/teamAudit";
import {
  buildRoster,
  teamStats,
  STALE_AFTER_DAYS,
  SELF_REPORT_LOOKBACK_DAYS,
} from "@/lib/roster";
import { currentTeamId } from "@/lib/session";
import { parseRange } from "@/lib/range";
import Avatar from "@/components/Avatar";
import { WeeklyKmChart } from "@/components/charts";
import InviteCard from "./InviteCard";
import RangePicker from "./RangePicker";
import { Tile, TodaysSession, RosterFlags } from "./_shared";

export const dynamic = "force-dynamic";

/**
 * The team overview — "how is the squad", answered without scrolling.
 *
 * This page and `/dashboard/roster` were one route. The roster table is
 * fourteen rows deep on a real team, which pushed every team-level number below
 * the fold, so the coach's first question ("is anything wrong today") was
 * answered underneath the answer to their second ("who do I open"). They are a
 * tab each now.
 *
 * ── NOTHING HERE IS A NEW MEASUREMENT ──────────────────────────────────────
 * Every figure is an aggregate of what `buildRoster` already computed per
 * athlete, and the aggregation itself lives in `lib/roster.ts` as `teamStats`
 * — the same function `/api/mobile/coach/roster` ships to the native coach
 * dashboard. Computing it here as well is how the phone and this page would
 * start banding the same squad differently.
 */
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
  const todayIso = localDayOffset(0, new Date(nowMs));
  const tomorrowIso = localDayOffset(-1, new Date(nowMs));
  const planAhead = teamId ? await teamPlanDays(teamId, todayIso, tomorrowIso) : new Map();

  const { entries: athletes, summary } = teamId
    ? await buildRoster(teamId, range, nowMs)
    : { entries: [], summary: { spikes: 0, sore: 0, quiet: 0, teamKm: 0, teamChangePct: null } };
  const { spikes, sore, quiet, teamKm, teamChangePct: teamDelta } = summary;

  const today = new Date(nowMs).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  /* One computation, two surfaces — see lib/roster.ts. */
  const stats = teamStats(athletes, todayIso);
  // RunGuard 2.0 (CAC 2026): the team audit. AI-assisted, see DISCLOSURE.md.
  const teamAudit = teamId !== null && athletes.length > 0 ? await buildTeamAudit(teamId, nowMs) : null;
  const bands = stats.acwr;

  /* Who needs opening today, in the roster's own order (missing data first). */
  const needsLook = athletes.filter(
    (a) =>
      a.spike !== null ||
      (a.risk.selfReport.persistentPart && a.risk.selfReport.persistentDays >= 3) ||
      a.daysSinceCheckIn === null ||
      a.daysSinceCheckIn >= STALE_AFTER_DAYS
  );

  /* Weeks arrive as ISO Mondays; a component never derives a date, so the
     label is made here. */
  const teamWeeks = stats.weeks.map((w) => ({
    week: new Date(w.week + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    km: w.km,
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Before practice today</h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
            {team ? `${team.name} · ` : ""}{today} · {athletes.length} athlete
            {athletes.length === 1 ? "" : "s"} tracked
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/*
            Suspense around RangePicker because it reads useSearchParams. This
            page is force-dynamic so it is never prerendered, but Next still
            prerenders the error and not-found shells that wrap it, and an
            unsuspended useSearchParams there fails the build rather than the
            request — a failure that would only appear at deploy time.
          */}
          <Suspense fallback={<div style={{ width: 190, height: 38 }} />}>
            <RangePicker />
          </Suspense>
          {team && <InviteCard joinCode={team.join_code} />}
        </div>
      </div>

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
            Share your team code with your athletes. When they sign up with it, they show up
            here automatically — risk-ranked, the moment their watch syncs.
          </p>
          {team && (
            <div
              className="mt-4 inline-block rounded-xl border px-6 py-3"
              style={{
                borderColor: "var(--brand)",
                background: "color-mix(in oklab, var(--brand) 8%, var(--surface))",
              }}
            >
              <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
                Team code
              </div>
              <div
                className="text-2xl font-extrabold tracking-wider"
                style={{ color: "var(--brand-strong)" }}
              >
                {team.join_code}
              </div>
            </div>
          )}
        </div>
      )}

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

      {/*
        The one actionable block. It repeats rows that are also on the roster
        tab, on purpose: the overview's job is that a coach who reads only this
        page has still seen everyone who needs opening before practice starts.
      */}
      {athletes.length > 0 && (
        <Panel
          title="Needs a look before practice"
          note={needsLook.length > 0 ? `${needsLook.length} of ${athletes.length}` : undefined}
          action={{ href: "/dashboard/roster", label: "Full roster →" }}
        >
          {needsLook.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
              Nothing flagged, and everyone has checked in recently. The roster tab has the
              full squad.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
              {needsLook.map(({ athlete: a, risk, spike, daysSinceCheckIn }) => (
                <li key={a.id} className="first:pt-0 py-3" style={{ borderColor: "var(--hairline)" }}>
                  <Link
                    href={`/dashboard/athlete/${a.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1.5 group"
                  >
                    <Avatar name={a.name} hue={a.hue} size={32} />
                    <span className="font-medium group-hover:underline">{a.name}</span>
                    <span className="flex-1 min-w-48">
                      <RosterFlags
                        self={risk.selfReport}
                        spike={spike}
                        daysSinceCheckIn={daysSinceCheckIn}
                        windowDays={SELF_REPORT_LOOKBACK_DAYS}
                      />
                    </span>
                    <span className="text-xs font-medium" style={{ color: "var(--brand-strong)" }}>
                      Open →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {athletes.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <Panel title="Team distance" note="everyone added together, through last week">
            <WeeklyKmChart data={teamWeeks} />
          </Panel>

          <Panel
            title="Workload spread"
            note="context only — this ratio showed no link to injury in a 5,205-runner study"
          >
            {bands.rated === 0 ? (
              <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
                Not enough training history on anyone yet for a workload ratio.
              </p>
            ) : (
              <>
                <BandBar
                  segments={[
                    { n: bands.under, label: "under 0.8", color: "var(--series-1)" },
                    { n: bands.inZone, label: "0.8–1.3", color: "var(--status-good)" },
                    { n: bands.over, label: "above 1.3", color: "var(--status-warning)" },
                  ]}
                  total={bands.rated}
                />
                <p className="text-xs mt-3" style={{ color: "var(--ink-muted)" }}>
                  {/*
                    Stated, not dropped. Taking the bands over a smaller
                    denominator without saying so would report athletes we know
                    nothing about as sitting in the safe band.
                  */}
                  Of {athletes.length} athlete{athletes.length === 1 ? "" : "s"}, {bands.rated} ha
                  {bands.rated === 1 ? "s" : "ve"} enough history to rate
                  {bands.unrated > 0
                    ? `; ${bands.unrated} ha${bands.unrated === 1 ? "s" : "ve"} not synced enough yet`
                    : ""}
                  .
                </p>
              </>
            )}
          </Panel>
        </div>
      )}

      {athletes.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          {/*
            The window is in the title, and the tile above is named alongside
            it. Unlabelled, this panel read "0 of 14" three inches under a tile
            reading "NOT CHECKING IN 0 — Everyone reporting", and both were
            true: nobody has logged one SINCE MIDNIGHT, and everybody has logged
            one in the last few days. Two windows, one screen, and no way for a
            coach to tell that from the numbers alone.
          */}
          <Panel
            title="Self-reports logged today"
            note={`${stats.reportedToday} of ${athletes.length} so far`}
          >
            <BandBar
              segments={[
                { n: stats.reportedToday, label: "logged today", color: "var(--status-good)" },
                {
                  n: athletes.length - stats.reportedToday,
                  label: "not yet today",
                  color: "var(--surface-3)",
                  muted: true,
                },
              ]}
              total={athletes.length}
            />
            <p className="text-xs mt-3" style={{ color: "var(--ink-muted)" }}>
              Today only — the tile above counts anyone quiet for {STALE_AFTER_DAYS}+ days,
              which is the one worth chasing. Self-reports are the only input RunGuard cannot
              read from a watch: a quiet athlete is not a healthy one, they are an unknown one.
            </p>
          </Panel>

          <Panel title="Squad by tier" note="from each athlete's own fitness score">
            <div className="flex flex-wrap gap-2">
              {stats.tiers.map((t) => (
                <div
                  key={t.tier}
                  className="rounded-xl border px-4 py-3"
                  style={{ borderColor: "var(--hairline)", background: "var(--surface-2)" }}
                >
                  <div className="text-2xl font-bold tabular-nums leading-none">{t.n}</div>
                  <div className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>
                    {t.tier}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {teamAudit && <TeamAuditPanel audit={teamAudit} />}
    </div>
  );
}

function Panel({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {note && (
          <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
            {note}
          </span>
        )}
        {action && (
          <Link
            href={action.href}
            className="text-xs font-medium hover:underline"
            style={{ color: "var(--brand-strong)" }}
          >
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * A proportion bar with the counts written on it.
 *
 * The numbers are printed beside each swatch rather than left to the segment
 * widths, because a band holding one athlete out of fourteen is a sliver — and
 * "one athlete is ramping hard" is exactly the case a coach must not miss to a
 * rounding error in a bar.
 */
function BandBar({
  segments,
  total,
}: {
  segments: { n: number; label: string; color: string; muted?: boolean }[];
  total: number;
}) {
  const shown = segments.filter((s) => s.n > 0);
  return (
    <>
      <div
        className="flex h-3 rounded-full overflow-hidden"
        style={{ background: "var(--surface-3)" }}
      >
        {shown.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.n / Math.max(1, total)) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-2 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
              style={{
                background: s.color,
                border: s.muted ? "1px solid var(--hairline-strong)" : undefined,
              }}
            />
            <span className="tabular-nums font-semibold">{s.n}</span>
            <span style={{ color: "var(--ink-muted)" }}>{s.label}</span>
          </span>
        ))}
      </div>
    </>
  );
}
