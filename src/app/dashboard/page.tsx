import { localDayOffset } from "@/lib/day";
import Link from "next/link";
import { listAthletes, athletesForTeam, getTeam, activitiesForAthlete, metricsForAthlete, sorenessHistory } from "@/lib/db";
import { computeRisk, type RiskSnapshot } from "@/lib/risk";
import { computeFitness } from "@/lib/engine";
import { currentTeamId } from "@/lib/session";
import RiskBadge from "@/components/RiskBadge";
import Avatar from "@/components/Avatar";
import { LoadSpark } from "@/components/charts";
import InviteCard from "./InviteCard";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const teamId = await currentTeamId();
  const team = teamId ? getTeam(teamId) : null;
  const nowMs = Date.now();
  const since = new Date(nowMs - 130 * 86400000).toISOString();
  const soreSince = localDayOffset(13, new Date(nowMs));
  const roster = teamId ? athletesForTeam(teamId) : listAthletes();
  const athletes = roster.map((a) => {
    const acts = activitiesForAthlete(a.id, since);
    const metrics = metricsForAthlete(a.id, since);
    // the roster is the coach's triage screen — it has to see what athletes
    // reported, not just what their watches recorded
    const sore = sorenessHistory(a.id, soreSince).map((s) => ({
      date: s.date,
      body_part: s.body_part,
      severity: s.severity,
    }));
    const risk = computeRisk(acts, metrics, new Date(nowMs), sore, a);
    const fitness = computeFitness(risk, metrics, acts);
    return { a, risk, fitness };
  });
  athletes.sort((x, y) => y.risk.score - x.risk.score);

  const atRisk = athletes.filter((x) => x.risk.zone === "high").length;
  const caution = athletes.filter((x) => x.risk.zone === "caution").length;
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
            label: "High risk today",
            value: String(atRisk),
            accent: atRisk > 0 ? "var(--status-critical)" : "var(--status-good)",
            sub: atRisk > 0 ? "Talk to them before warmup" : "Nobody flagged",
          },
          {
            label: "Caution",
            value: String(caution),
            accent: caution > 0 ? "var(--status-warning)" : "var(--status-good)",
            sub: "Watch load this week",
          },
          {
            label: "Team distance (7d)",
            value: `${Math.round(teamKm)} km`,
            accent: undefined as string | undefined,
            sub: `${teamDelta >= 0 ? "+" : ""}${teamDelta}% vs last week`,
          },
          {
            label: "Ready to train",
            value: String(athletes.length - atRisk - caution),
            accent: "var(--status-good)",
            sub: "In the safe zone",
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
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium text-right">Ratio</th>
              <th className="px-3 py-3 font-medium text-right">7-day km</th>
              <th className="px-3 py-3 font-medium text-right">Ramp</th>
              <th className="px-3 py-3 font-medium hidden md:table-cell w-36">Last 4 weeks</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {athletes.map(({ a, risk, fitness }) => (
              <tr
                key={a.id}
                className="border-t transition-colors hover:bg-black/[0.03]"
                style={{
                  borderColor: "var(--hairline)",
                  boxShadow: `inset 3px 0 0 ${
                    risk.zone === "high"
                      ? "var(--status-critical)"
                      : risk.zone === "caution"
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
                  <RiskBadge zone={risk.zone} score={risk.score} />
                  <SelfReportFlag self={risk.selfReport} />
                </td>
                <td
                  className="px-3 py-3 text-right tabular-nums"
                  style={{
                    color:
                      risk.acwr !== null && (risk.acwr > 1.5 || risk.acwr > 1.3)
                        ? risk.acwr > 1.5
                          ? "var(--status-critical)"
                          : "var(--status-warning)"
                        : "var(--ink-2)",
                  }}
                >
                  {risk.acwr ?? "—"}
                </td>
                <td className="px-3 py-3 text-right tabular-nums" style={{ color: "var(--ink-2)" }}>
                  {risk.weekKm}
                </td>
                <td className="px-3 py-3 text-right tabular-nums" style={{ color: "var(--ink-2)" }}>
                  {risk.rampPct !== null ? `${risk.rampPct > 0 ? "+" : ""}${risk.rampPct}%` : "—"}
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
 * What the athlete reported, shown next to the score rather than folded into it.
 * Check-ins are optional, so scoring them would rank the athletes who report
 * honestly above the ones who stay quiet. Keeping it separate means a coach
 * reads both, and a blank here means "we don't know", not "they're fine".
 */
function SelfReportFlag({ self }: { self: RiskSnapshot["selfReport"] }) {
  const persistent = self.persistentPart && self.persistentDays >= 3;
  // a bad report today matters even when it isn't part of a pattern — an
  // athlete saying 8/10 this morning must not be invisible on the triage screen
  const acute = !persistent && self.todayMax >= 6;
  const stale = self.hasData && (self.daysSinceReport ?? 0) >= 5;

  if (acute) {
    return (
      <div
        className="text-[11px] mt-1 font-medium"
        style={{ color: "var(--status-critical)" }}
        title={`Reported ${self.todayMax}/10 in the ${self.todayPart} today`}
      >
        ⚠ {self.todayPart} · {self.todayMax}/10 today
      </div>
    );
  }

  if (!persistent && !self.hasData) {
    return (
      <div className="text-[11px] mt-1" style={{ color: "var(--ink-muted)" }}>
        no check-ins
      </div>
    );
  }
  if (!persistent && stale) {
    return (
      <div className="text-[11px] mt-1" style={{ color: "var(--ink-muted)" }}>
        no check-in · {self.daysSinceReport}d
      </div>
    );
  }
  if (!persistent) return null;

  return (
    <div
      className="text-[11px] mt-1 font-medium"
      style={{ color: "var(--status-warning)" }}
      title={`Reported sore on ${self.persistentDays} of the last 7 days, peak ${self.persistentPeak}/10`}
    >
      ⚠ {self.persistentPart} · {self.persistentDays}/7d{self.escalating ? " ↑" : ""}
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
