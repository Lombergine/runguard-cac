import { localDayOffset } from "@/lib/day";
import { miNum } from "@/lib/units";
import Link from "next/link";
import { athletesForTeam, getTeam, activitiesForAthlete, metricsForAthlete, sorenessHistory } from "@/lib/db";
import { computeRisk, sessionSpike, type RiskSnapshot, type SessionSpike } from "@/lib/risk";
import { computeFitness } from "@/lib/engine";
import { currentTeamId } from "@/lib/session";
import Avatar from "@/components/Avatar";
import { LoadSpark } from "@/components/charts";
import InviteCard from "./InviteCard";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const teamId = await currentTeamId();
  const team = teamId ? await getTeam(teamId) : null;
  const nowMs = Date.now();
  const since = new Date(nowMs - 130 * 86400000).toISOString();
  const soreSince = localDayOffset(13, new Date(nowMs));
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
    // most recent run that was markedly longer than anything before it
    const spikeRun = [...acts]
      .sort((x, y) => y.start_time.localeCompare(x.start_time))
      .slice(0, 7)
      .map((x) => ({ at: x.start_time, spike: sessionSpike(x, acts) }))
      .find((x) => x.spike !== null);
    return { a, risk, fitness, spike: spikeRun?.spike ?? null };
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
  const teamKm = athletes.reduce((s, x) => s + x.risk.weekKm, 0);
  const teamPrevKm = athletes.reduce((s, x) => s + x.risk.prevWeekKm, 0);
  const teamDelta = teamPrevKm > 0 ? Math.round(((teamKm - teamPrevKm) / teamPrevKm) * 100) : 0;

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
        {team && <InviteCard joinCode={team.join_code} />}
      </div>

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
            label: "Team distance (7d)",
            value: `${miNum(teamKm, 0)} mi`,
            accent: undefined as string | undefined,
            sub: `${teamDelta >= 0 ? "+" : ""}${teamDelta}% vs last week`,
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
              <th className="px-3 py-3 font-medium text-right">7-day mi</th>
              <th className="px-3 py-3 font-medium hidden md:table-cell w-36">Last 4 weeks</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {athletes.map(({ a, risk, fitness, spike }) => (

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
                  {miNum(risk.weekKm)}
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
        Ratio = acute:chronic workload (7-day vs 28-day training load). Sweet spot 0.8–1.3.
        Scores update automatically as athletes&apos; watches sync.
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
