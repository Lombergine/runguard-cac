import { Suspense } from "react";
import Link from "next/link";
import { miNum } from "@/lib/units";
import { getTeam } from "@/lib/db";
import { buildRoster, SELF_REPORT_LOOKBACK_DAYS } from "@/lib/roster";
import { currentTeamId } from "@/lib/session";
import { parseRange } from "@/lib/range";
import Avatar from "@/components/Avatar";
import { LoadSpark } from "@/components/charts";
import RangePicker from "../RangePicker";
import { RosterFlags } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * The roster: every athlete, ranked missing-data-first, each row a way in.
 *
 * Split out of `/dashboard`, which used to carry the team numbers AND this
 * table. On a squad of fourteen the table pushed everything else off the first
 * screen, so the two questions a coach actually has — "how is the squad" and
 * "who do I open" — were competing for the same scroll. They are now a tab
 * each; the overview links here, and this links to each athlete.
 *
 * The ordering, the flag vocabulary and every number still come from
 * `buildRoster`, which `/api/mobile/coach/roster` also calls, so this page and
 * the native app cannot disagree about who has gone quiet.
 */
export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const range = parseRange((await searchParams).range);
  const teamId = await currentTeamId();
  const team = teamId ? await getTeam(teamId) : null;
  // Server Component, force-dynamic: this re-runs per request, so the clock is
  // the request time. See the note on the overview page.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  // Fail closed: no team id means no roster, never "every athlete in the table".
  const { entries: athletes } = teamId
    ? await buildRoster(teamId, range, nowMs)
    : { entries: [] };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Roster</h1>
          <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
            {team ? `${team.name} · ` : ""}
            {athletes.length} athlete{athletes.length === 1 ? "" : "s"}
            {" · anyone we haven\u2019t heard from is at the top"}
          </p>
        </div>
        {/* Suspended because RangePicker reads useSearchParams — see the
            overview page for why that matters at build time and not just here. */}
        <Suspense fallback={<div style={{ width: 190, height: 38 }} />}>
          <RangePicker />
        </Suspense>
      </div>

      {athletes.length === 0 ? (
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
        >
          <div className="text-lg font-semibold">Your roster is empty, for now</div>
          <p className="text-sm mt-2 max-w-md mx-auto" style={{ color: "var(--ink-muted)" }}>
            Share your team code with your athletes. When they sign up with it, they show up
            here automatically: the moment their watch syncs.
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
      ) : (
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
              {athletes.map(({ athlete: a, risk, fitness, spike, rangeKm, daysSinceCheckIn }) => {
                const flagged =
                  spike ||
                  (risk.selfReport.persistentPart && risk.selfReport.persistentDays >= 3);
                return (
                  <tr
                    key={a.id}
                    className="border-t transition-colors hover:bg-black/[0.03]"
                    style={{
                      borderColor: "var(--hairline)",
                      /* A left rule, not a tinted row: the flag has to survive
                         being read at arm's length and by someone who cannot
                         separate the amber from the cream. */
                      boxShadow: `inset 3px 0 0 ${
                        flagged ? "var(--status-warning)" : "transparent"
                      }`,
                    }}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/athlete/${a.id}`} className="flex items-center gap-3">
                        <Avatar name={a.name} hue={a.hue} />
                        <span>
                          <span className="font-medium block leading-tight">{a.name}</span>
                          <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
                            Grade {a.grade} · {fitness.tier}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <RosterFlags
                        self={risk.selfReport}
                        spike={spike}
                        daysSinceCheckIn={daysSinceCheckIn}
                        windowDays={SELF_REPORT_LOOKBACK_DAYS}
                      />
                    </td>
                    <td
                      className="px-3 py-3 text-right tabular-nums"
                      style={{ color: "var(--ink-2)" }}
                    >
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
        The window above moves the distance figures. Soreness patterns stay on their own
        7-day lookback and acute:chronic workload stays 7-day vs 28-day, both are defined
        on fixed windows and would mean nothing rescaled. Numbers update as watches sync.
      </p>
    </div>
  );
}
