import Link from "next/link";
import { notFound } from "next/navigation";
import { buildProfile } from "@/lib/profile";
import { getAthlete } from "@/lib/db";
import { currentTeamId } from "@/lib/session";
import { coachWhy } from "@/lib/chat";
import RiskBadge from "@/components/RiskBadge";
import Avatar from "@/components/Avatar";
import { AcwrChart, LoadChart, WeeklyKmChart } from "@/components/charts";
import { RecoverySnapshot } from "@/lib/risk";
import IntensityCalendar from "@/components/IntensityCalendar";
import Gauge from "@/components/Gauge";
import AthleteModel from "@/components/athlete/AthleteModel";
import {
  HomeTab,
  TrainingTab,
  StatsTab,
  RecoveryTab,
  RaceTab,
  ChatTab,
  ProfileTab,
  Panel,
} from "@/components/athlete/tabs";

export const dynamic = "force-dynamic";

const TABS = ["Home", "Training", "Stats", "Recovery", "Race", "AI Chat", "Profile"] as const;

export default async function AthletePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; tab?: string }>;
}) {
  const { id } = await params;
  const { view, tab } = await searchParams;
  const athleteView = view === "athlete";
  const activeTab = TABS.includes(tab as (typeof TABS)[number]) ? (tab as (typeof TABS)[number]) : "Home";

  // team-scope: a coach may only open athletes on their own team
  const teamId = await currentTeamId();
  const target = getAthlete(Number(id));
  if (!target) notFound();
  if (teamId && target.team_id && target.team_id !== teamId) notFound();

  const p = buildProfile(Number(id));
  if (!p) notFound();

  const first = p.athlete.name.split(" ")[0];
  const flagColor =
    p.risk.zone === "high"
      ? "var(--status-critical)"
      : p.risk.zone === "caution"
        ? "var(--status-warning)"
        : "var(--status-good)";
  const flagLabel =
    p.risk.zone === "high" ? "High risk" : p.risk.zone === "caution" ? "Elevated" : "All clear";

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm hover:underline" style={{ color: "var(--ink-muted)" }}>
        ← Roster
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={p.athlete.name} hue={p.athlete.hue} size={56} />
        <div className="flex-1 min-w-40">
          <h1 className="text-2xl font-bold tracking-tight">{p.athlete.name}</h1>
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
            Grade {p.athlete.grade} · {p.fitness.tier} tier ·{" "}
            <span style={{ color: "var(--ink-2)" }}>{p.connectedSources.join(" + ")}</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Gauge
            value={p.risk.score}
            color={
              p.risk.zone === "high"
                ? "var(--status-critical)"
                : p.risk.zone === "caution"
                  ? "var(--status-warning)"
                  : "var(--status-good)"
            }
            size={76}
            label="risk"
          />
          <RiskBadge zone={p.risk.zone} size="lg" />
        </div>
      </div>

      {/* view toggle */}
      <div className="inline-flex rounded-full border p-1 text-sm" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
        <Tab href={`/dashboard/athlete/${p.athlete.id}`} active={!athleteView}>Coach view</Tab>
        <Tab href={`/dashboard/athlete/${p.athlete.id}?view=athlete`} active={athleteView}>The RunGuard app ({first}&apos;s view)</Tab>
      </div>

      {athleteView ? (
        <>
          {/* app tab bar */}
          <div className="flex flex-wrap gap-1.5 rounded-2xl border p-1.5" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
            {TABS.map((t) => (
              <Link
                key={t}
                href={`/dashboard/athlete/${p.athlete.id}?view=athlete&tab=${encodeURIComponent(t)}`}
                className="rounded-xl px-3.5 py-2 text-sm font-medium"
                style={
                  t === activeTab
                    ? { background: "var(--ember)", color: "#000", boxShadow: "0 2px 12px rgba(245,158,11,0.25)" }
                    : { color: "var(--ink-2)" }
                }
              >
                {t}
              </Link>
            ))}
          </div>

          {activeTab === "Home" && <HomeTab p={p} />}
          {activeTab === "Training" && <TrainingTab p={p} />}
          {activeTab === "Stats" && <StatsTab p={p} />}
          {activeTab === "Recovery" && <RecoveryTab p={p} />}
          {activeTab === "Race" && <RaceTab p={p} />}
          {activeTab === "AI Chat" && <ChatTab p={p} />}
          {activeTab === "Profile" && <ProfileTab p={p} />}
        </>
      ) : (
        <CoachView p={p} flagColor={flagColor} flagLabel={flagLabel} coachExplanation={coachWhy(p)} />
      )}
    </div>
  );
}

/* ---------------- coach view ---------------- */

function CoachView({
  p,
  flagColor,
  flagLabel,
  coachExplanation,
}: {
  p: NonNullable<ReturnType<typeof buildProfile>>;
  flagColor: string;
  flagLabel: string;
  coachExplanation: string;
}) {
  return (
    <div className="space-y-6">
      {/* pre-practice flag */}
      <div
        className="rounded-2xl border p-5 flex flex-wrap items-center gap-4"
        style={{ borderColor: "color-mix(in oklab, " + flagColor + " 50%, transparent)", background: "color-mix(in oklab, " + flagColor + " 9%, var(--surface))" }}
      >
        <span
          className="text-base font-extrabold uppercase tracking-wide px-4 py-1.5 rounded-full shrink-0"
          style={{ background: flagColor, color: "#fff" }}
        >
          {flagLabel}
        </span>
        <p className="text-sm flex-1 min-w-60 leading-relaxed" style={{ color: "var(--ink-2)" }}>
          <span className="font-semibold text-ember">RunGuard AI: </span>
          {coachExplanation}
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-4 items-stretch">
        <AthleteModel
          readiness={p.readiness}
          zone={p.risk.zone}
          hotspots={[
            ...p.injuries.map((i) => ({ part: i.body_part, kind: "injury" as const })),
            ...(p.todayCheckin?.soreness_part
              ? [{ part: p.todayCheckin.soreness_part, severity: p.todayCheckin.soreness_severity, kind: "soreness" as const }]
              : []),
          ]}
        />
        <div className="rounded-2xl border p-5 space-y-3" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>What the data says</h2>
          {p.risk.insights.map((line, i) => (
            <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>{line}</p>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <CStat label="Workload ratio" value={p.risk.acwr?.toFixed(2) ?? "—"} />
        <CStat label="This week" value={`${p.risk.weekKm} km`} />
        <CStat label="Ramp" value={p.risk.rampPct !== null ? `${p.risk.rampPct > 0 ? "+" : ""}${p.risk.rampPct}%` : "—"} />
        <CStat label="Week TRIMP" value={String(p.load.weekTrimp)} />
        <CStat label="Days since rest" value={String(p.risk.daysSinceRest)} />
      </div>

      <RecoveryPanel recovery={p.risk.recovery} />

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Injury risk ratio (60 days)" note="Shaded band = safe zone 0.8–1.3 · dashed = danger 1.5">
          <AcwrChart data={p.series.slice(-60)} />
        </Panel>
        <Panel title="Training load (60 days)">
          <LoadChart data={p.series.slice(-60)} />
        </Panel>
      </div>

      <Panel title="Weekly distance (12 weeks)">
        <WeeklyKmChart data={p.weeks} />
      </Panel>

      {/* full-year intensity heatmap */}
      <Panel title="Training year" note="how hard they went, every single day · ← → to browse months">
        <IntensityCalendar days={p.yearDays} />
      </Panel>

      {/* fitness & load detail */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <CStat label="Fitness score" value={`${p.fitness.score}`} />
        <CStat label="Tier" value={p.fitness.tier} />
        <CStat label="Trend" value={p.fitness.trend} />
        <CStat label="Freshness" value={`${p.fitness.freshness}`} />
        <CStat label="VO₂max" value={p.fitness.vo2max !== null ? `${p.fitness.vo2max}` : "—"} />
      </div>

      {/* pattern detection */}
      <Panel title="Pattern detection">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          <PatternRow label="Monotony" value={p.patterns.monotony !== null ? `${p.patterns.monotony}` : "—"} warn={p.patterns.monotony !== null && p.patterns.monotony > 2} />
          <PatternRow label="High-effort streak" value={`${p.patterns.highEffortStreak} days`} warn={p.patterns.highEffortStreak >= 5} />
          <PatternRow label="Days since hard effort" value={p.patterns.daysSinceHardEffort !== null ? `${p.patterns.daysSinceHardEffort}` : "—"} warn={false} />
          <PatternRow label="Sleep debt (7d)" value={p.patterns.sleepDebtH !== null ? `${p.patterns.sleepDebtH} h` : "—"} warn={p.patterns.sleepDebtH !== null && p.patterns.sleepDebtH > 4} />
          <PatternRow label="Sleep consistency" value={p.patterns.sleepConsistency !== null ? `${p.patterns.sleepConsistency}/100` : "—"} warn={p.patterns.sleepConsistency !== null && p.patterns.sleepConsistency < 60} />
          <PatternRow label="Overreaching" value={p.patterns.overreaching ? "YES" : "no"} warn={p.patterns.overreaching} />
          <PatternRow label="Undertraining" value={p.patterns.undertraining ? "YES" : "no"} warn={p.patterns.undertraining} />
          <PatternRow label="Illness pattern" value={p.illness ? "YES" : "no"} warn={p.illness} />
        </div>
      </Panel>

      {/* self-reported check-in */}
      <Panel title="Athlete self-report" note={p.todayCheckin ? "logged today" : "no check-in today"}>
        {p.todayCheckin ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
            <PatternRow
              label="Soreness"
              value={p.todayCheckin.soreness_severity !== null ? `${p.todayCheckin.soreness_severity}/10${p.todayCheckin.soreness_part ? ` (${p.todayCheckin.soreness_part})` : ""}` : "—"}
              warn={(p.todayCheckin.soreness_severity ?? 0) >= 5}
            />
            <PatternRow label="Energy" value={p.todayCheckin.energy !== null ? `${p.todayCheckin.energy}/10` : "—"} warn={(p.todayCheckin.energy ?? 10) <= 4} />
            <PatternRow label="Session RPE" value={p.todayCheckin.rpe !== null ? `${p.todayCheckin.rpe}/10` : "—"} warn={false} />
            <PatternRow label="Academic stress" value={p.todayCheckin.academic_stress ? "YES" : "no"} warn={Boolean(p.todayCheckin.academic_stress)} />
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
            Nothing logged today — their most recent mood and soreness trends are in the app view under Profile.
          </p>
        )}
      </Panel>

      {/* races & predictions */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Next race" note={p.races.upcoming[0] ? `${p.races.upcoming[0].daysUntil} days out` : undefined}>
          {p.races.upcoming[0] ? (
            <div className="text-sm space-y-2" style={{ color: "var(--ink-2)" }}>
              <p className="font-semibold" style={{ color: "var(--ink)" }}>
                {p.races.upcoming[0].name} · {p.races.upcoming[0].event}
              </p>
              <p>
                Race readiness:{" "}
                <span className="font-bold tabular-nums" style={{ color: p.races.upcoming[0].readiness >= 70 ? "var(--status-good)" : p.races.upcoming[0].readiness >= 40 ? "var(--status-warning)" : "var(--status-critical)" }}>
                  {p.races.upcoming[0].readiness}/100
                </span>{" "}
                · predicted {p.races.upcoming[0].predicted}
              </p>
              {p.plan.taperMode && <p style={{ color: "var(--brand-strong)" }}>Taper mode active — their plan is already adjusted.</p>}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>No races scheduled.</p>
          )}
        </Panel>
        <Panel title="PRs vs predicted">
          <table className="w-full text-sm">
            <tbody>
              {p.prs.map((pr) => {
                const pred = p.predictions[pr.event];
                const faster = pr.timeS !== null && pred.timeS < pr.timeS;
                return (
                  <tr key={pr.event}>
                    <td className="py-1 font-medium">{pr.event}</td>
                    <td className="py-1 text-right tabular-nums" style={{ color: "var(--ink-2)" }}>PR {pr.label}</td>
                    <td className="py-1 text-right tabular-nums font-semibold" style={{ color: faster ? "var(--status-good)" : "var(--ink)" }}>now {pred.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>

      {/* injuries */}
      {p.injuries.length > 0 && (
        <Panel title="Injury history">
          <div className="space-y-2.5">
            {p.injuries.map((i) => (
              <div key={i.id} className="text-sm" style={{ color: "var(--ink-2)" }}>
                <span className="font-medium">{i.body_part}</span>
                <span className="text-xs ml-2" style={{ color: "var(--ink-muted)" }}>
                  {new Date(i.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                {i.note && <div className="text-xs mt-0.5" style={{ color: "var(--ink-muted)" }}>{i.note}</div>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {p.chatSummary.length > 0 && (
        <Panel title="What they've been asking RunGuard AI" note="athlete chat summary">
          <div className="space-y-2">
            {p.chatSummary.map((q, i) => (
              <p key={i} className="text-sm" style={{ color: "var(--ink-2)" }}>&ldquo;{q}&rdquo;</p>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function PatternRow({ label, value, warn }: { label: string; value: string; warn: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>{label}</div>
      <div className="font-semibold tabular-nums mt-0.5" style={{ color: warn ? "var(--status-warning)" : "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

function CStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function RecoveryPanel({ recovery: r }: { recovery: RecoverySnapshot }) {
  if (!r.hasData) return null;
  const rhrColor = r.restingHrDelta !== null && r.restingHrDelta >= 5 ? "var(--status-critical)" : r.restingHrDelta !== null && r.restingHrDelta <= -3 ? "var(--status-good)" : "var(--ink)";
  const hrvColor = r.hrvDeltaPct !== null && r.hrvDeltaPct <= -12 ? "var(--status-critical)" : r.hrvDeltaPct !== null && r.hrvDeltaPct >= 8 ? "var(--status-good)" : "var(--ink)";
  const sleepColor = r.sleepAvg !== null && r.sleepAvg < 7 ? "var(--status-warning)" : "var(--ink)";
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold">Recovery</h2>
        <span className="text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: "rgba(245,158,11,0.15)", color: "var(--brand-strong)" }}>Apple Health</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ["Resting HR", r.restingHr !== null ? `${r.restingHr} bpm` : "—", r.restingHrDelta !== null ? `${r.restingHrDelta > 0 ? "+" : ""}${r.restingHrDelta} vs base` : null, rhrColor],
          ["HRV", r.hrv !== null ? `${r.hrv} ms` : "—", r.hrvDeltaPct !== null ? `${r.hrvDeltaPct > 0 ? "+" : ""}${r.hrvDeltaPct}% vs base` : null, hrvColor],
          ["Sleep (7d avg)", r.sleepAvg !== null ? `${r.sleepAvg} h` : "—", null, sleepColor],
          ["VO₂max", r.vo2max !== null ? `${r.vo2max}` : "—", null, "var(--ink)"],
        ] as const).map(([label, value, delta, color]) => (
          <div key={label}>
            <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>{label}</div>
            <div className="text-xl font-bold mt-1 tabular-nums" style={{ color }}>{value}</div>
            {delta && <div className="text-xs mt-0.5" style={{ color }}>{delta}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-full px-4 py-1.5 font-medium" style={active ? { background: "var(--ember)", color: "#000", boxShadow: "0 2px 12px rgba(245,158,11,0.25)" } : { color: "var(--ink-2)" }}>
      {children}
    </Link>
  );
}

