import { chatTabLabel, assistantName } from "@/lib/ai";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildProfile } from "@/lib/profile";
import { getAthlete } from "@/lib/db";
import { miNum } from "@/lib/units";
import { currentTeamId } from "@/lib/session";
import { coachWhy } from "@/lib/chat";
import Avatar from "@/components/Avatar";
import { AcwrChart, LoadChart, WeeklyKmChart } from "@/components/charts";
import { RecoverySnapshot, type RiskSnapshot, type EnergyTrend } from "@/lib/risk";
import IntensityCalendar from "@/components/IntensityCalendar";
import InfoDot from "@/components/InfoDot";
import Gauge from "@/components/Gauge";
import AthleteModel from "@/components/athlete/AthleteModel";
import InjuryManager from "@/components/InjuryManager";
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

/*
 * The tab IDS are stable and the LABEL for the chat tab is not — see lib/ai.ts.
 *
 * Keeping the id fixed matters: it is what `?tab=` carries, so a link someone
 * saved must not stop working because a model was switched on. Only the word on
 * screen changes.
 */
const TABS = ["Home", "Training", "Stats", "Recovery", "Race", "Chat", "Profile"] as const;

function tabLabel(tab: (typeof TABS)[number]): string {
  return tab === "Chat" ? chatTabLabel() : tab;
}

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
  const target = await getAthlete(Number(id));
  if (!target) notFound();
  // Strict: `&& target.team_id` short-circuited for team-less athletes.
  if (teamId == null || target.team_id !== teamId) notFound();

  const p = await buildProfile(Number(id));
  if (!p) notFound();

  const first = p.athlete.name.split(" ")[0];
  const flagColor =
    p.prePractice.flag === "unusual"
      ? "var(--status-critical)"
      : p.prePractice.flag === "watch"
        ? "var(--status-warning)"
        : "var(--status-good)";
  const flagLabel =
    p.prePractice.flag === "unusual"
      ? "Worth a look"
      : p.prePractice.flag === "watch"
        ? "Check in with them"
        : "Nothing standing out";

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
          <Gauge value={p.readiness} color={flagColor} size={76} label="readiness" />
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
                {tabLabel(t)}
              </Link>
            ))}
          </div>

          {activeTab === "Home" && <HomeTab p={p} />}
          {activeTab === "Training" && <TrainingTab p={p} />}
          {activeTab === "Stats" && <StatsTab p={p} />}
          {activeTab === "Recovery" && <RecoveryTab p={p} />}
          {activeTab === "Race" && <RaceTab p={p} />}
          {activeTab === "Chat" && <ChatTab p={p} />}
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
  p: NonNullable<Awaited<ReturnType<typeof buildProfile>>>;
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
          <span className="font-semibold text-ember">{assistantName()}: </span>
          {coachExplanation}
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-4 items-stretch">
        <AthleteModel
          readiness={p.readiness}
          zone={p.readiness < 40 ? "high" : p.readiness < 65 ? "caution" : "ready"}
          hotspots={[
            ...p.injuries.filter((i) => !i.resolved_at).map((i) => ({ part: i.body_part, kind: "injury" as const })),
            ...p.todaySoreness.map((s) => ({ part: s.part, severity: s.severity, kind: "soreness" as const })),
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
        <CStat
          label="Workload ratio"
          value={p.risk.acwr?.toFixed(2) ?? "—"}
          info="Their last 7 days of training weighted against their 28-day base, both smoothed so one big day can't swing it. 0.8–1.3 is the safe zone; above 1.5 is the classic spike-before-injury pattern. Blank until there's enough history for a real base."
        />
        <CStat
          label="This week"
          value={`${miNum(p.risk.weekKm)} mi`}
          info="Distance run in the last 7 days — a rolling window, not since Monday."
        />
        <CStat
          label="Ramp"
          value={p.risk.rampPct !== null ? `${p.risk.rampPct > 0 ? "+" : ""}${p.risk.rampPct}%` : "—"}
          info="Week-over-week change in distance: the last 7 days against the 7 before. Shown for context only — in a cohort of 5,205 runners, week-to-week ratios like this had no association with injury. Blank if the previous week was under 2 mi."
        />
        <CStat
          label="Week TRIMP"
          value={String(p.load.weekTrimp)}
          info="Training impulse over the last 7 days — how long each run was, weighted sharply upward by how hard their heart was working. Catches the intensity that distance alone misses. Runs synced without heart-rate data count as zero."
        />
        <CStat
          label="Days since rest"
          value={String(p.risk.daysSinceRest)}
          info="Consecutive training days counting back from today; only a near-zero day breaks the streak. Adaptation happens in recovery, so long unbroken runs of training days are worth noticing."
        />
      </div>

      <RecoveryPanel recovery={p.risk.recovery} />

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Workload ratio (60 days)" note="context only — this ratio showed no link to injury in a 5,205-runner study">
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
        <CStat
          label="Fitness score"
          value={p.risk.hasActivityHistory ? `${p.fitness.score}` : "—"}
          info="0–100, from their most recent week with real running in it: 55% Apple's VO₂max reading, 45% distance-weighted pace (about 11:15/mi scores 0, 5:20/mi scores 100). With no VO₂max on file it's pace alone."
        />
        <CStat
          label="Tier"
          value={p.risk.hasActivityHistory ? p.fitness.tier : "Not enough data"}
          info="A band on the fitness score: Developing under 40, Intermediate 40–57, Advanced 58–74, Elite 75 and up."
        />
        <CStat
          label="Trend"
          value={p.fitness.trend}
          info="This week's fitness score against the average of the previous four weeks. More than 2 points up is improving, more than 2 down is declining, anything in between is a plateau."
        />
        <CStat
          label="Freshness"
          value={`${p.fitness.freshness}`}
          info="How far the last 7 days sit below their 28-day base — high after a taper or an easy week, low mid-block. Not the same as fitness: an athlete can be very fit and very flat."
        />
        <CStat
          label="VO₂max"
          value={p.fitness.vo2max !== null ? `${p.fitness.vo2max}` : "—"}
          info="Apple's Cardio Fitness estimate, read straight from Health — RunGuard doesn't calculate it. It's one of the two inputs to the fitness score."
        />
      </div>

      {/* pattern detection */}
      <Panel title="Pattern detection">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          <PatternRow label="Monotony" value={p.patterns.monotony !== null ? `${p.patterns.monotony}` : "—"} warn={p.patterns.monotony !== null && p.patterns.monotony > 2} info={"Foster's training monotony: the average of the last 7 days' training load divided by how much that load varied from day to day. Every day looking the same scores high. Above 2 with real volume behind it starts adding to the risk score — hard days and easy days have to actually differ. Blank when the week's loads barely varied at all."} />
          <PatternRow label="High-effort streak" value={`${p.patterns.highEffortStreak} days`} warn={p.patterns.highEffortStreak >= 5} info={"Consecutive days, counting back from today, where the day's training load sat more than 15% above this athlete's own median training day. Six or more is one of the three things that trips the Overreaching flag."} />
          <PatternRow label="Days since hard effort" value={p.patterns.daysSinceHardEffort !== null ? `${p.patterns.daysSinceHardEffort}` : "—"} warn={false} info={'Days since a session whose load was more than 40% above their median training day. A long gap is not automatically bad — it is what a taper or a recovery week looks like — but it is the number to check before assuming an athlete is sharp.'} />
          <PatternRow label="Sleep debt (7d)" value={p.patterns.sleepDebtH !== null ? `${p.patterns.sleepDebtH} h` : "—"} warn={p.patterns.sleepDebtH !== null && p.patterns.sleepDebtH > 4} info={'Hours short of 8 h, added up across the last 7 nights of Apple Health sleep data. Only shortfalls count: a 9-hour night does not pay back a 6-hour one. Blank rather than stale when nothing was recorded in the window — it never reaches further back to find nights.'} />
          <PatternRow label="Sleep consistency" value={p.patterns.sleepConsistency !== null ? `${p.patterns.sleepConsistency}/100` : "—"} warn={p.patterns.sleepConsistency !== null && p.patterns.sleepConsistency < 60} info={'0–100, from how much sleep length swung night to night across the last 7 nights. The same hours every night scores near 100; 5 h then 10 h scores low even when the average looks healthy. Needs at least 4 nights recorded in the window.'} />
          <PatternRow label="Overreaching" value={p.patterns.overreaching ? "YES" : "no"} warn={p.patterns.overreaching} info={'Trips when any one of three things is true: workload ratio above 1.5; ratio above 1.4 together with monotony above 1.7; or six straight high-effort days. It is a flag to ask about, not a diagnosis.'} />
          <PatternRow label="Undertraining" value={p.patterns.undertraining ? "YES" : "no"} warn={p.patterns.undertraining} info={'Trips only when the workload ratio is under 0.7 AND the last 7 days are under 70% of their 4-week average, and only for athletes averaging real volume. Deliberately hard to trip, so a planned easy week does not set it off.'} />
          <PatternRow label="Illness pattern" value={p.illness ? "YES" : "no"} warn={p.illness} info={'Resting heart rate at least 5 bpm above their baseline at the same time as HRV at least 15% below it. That combination often appears a day or two before someone feels ill. A pattern, not a diagnosis — ask them how they feel.'} />
        </div>
      </Panel>

      {/* self-reported check-in */}
      <Panel
        title="Athlete self-report"
        note={
          p.todayCheckin
            ? "logged today"
            : p.risk.selfReport.daysSinceReport !== null
              ? `last check-in ${p.risk.selfReport.daysSinceReport}d ago`
              : "never checked in"
        }
      >
        <SelfReportPanel
          self={p.risk.selfReport}
          todayCheckin={p.todayCheckin}
          todaySoreness={p.todaySoreness}
          energyTrend={p.energyTrend}
        />
      </Panel>

      {/* races & predictions */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Next race" note={p.races.upcoming[0] ? `${p.races.upcoming[0].daysUntil} days out` : undefined}>
          {p.races.upcoming[0] ? (
            <div className="text-sm space-y-2" style={{ color: "var(--ink-2)" }}>
              <p className="font-semibold" style={{ color: "var(--ink)" }}>
                {p.races.upcoming[0].name} · {p.races.upcoming[0].event}
              </p>
              {p.risk.hasActivityHistory ? (
                <p>Predicted {p.races.upcoming[0].predicted}</p>
              ) : (
                <p style={{ color: "var(--ink-muted)" }}>Not enough training data yet for a readiness/prediction estimate.</p>
              )}
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

      {/* injuries — coach-recorded, never computed */}
      <Panel title="Injuries" note="recorded by the coach · only active ones show on the body scan">
        <InjuryManager athleteId={p.athlete.id} injuries={p.injuries} />
      </Panel>

      {p.chatSummary.length > 0 && (
        <Panel title={`What they've been asking ${assistantName()}`} note="athlete chat summary">
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

function PatternRow({
  label,
  value,
  warn,
  info,
}: {
  label: string;
  value: string;
  warn: boolean;
  info?: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
        {label}
        {info && <InfoDot text={info} label={label} />}
      </div>
      <div className="font-semibold tabular-nums mt-0.5" style={{ color: warn ? "var(--status-warning)" : "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

/**
 * The self-report panel. Deliberately shows the 7-day pattern *before* today's
 * numbers, and shows it even when nothing was logged today — a shin that has
 * been sore all week matters whether or not the athlete opened the app this
 * morning. None of this moves the risk score (check-ins are optional, so
 * scoring them would penalise honest reporters); it sits beside it.
 */
function SelfReportPanel({
  self,
  todayCheckin,
  todaySoreness,
  energyTrend,
}: {
  self: RiskSnapshot["selfReport"];
  todayCheckin: { energy: number | null; rpe: number | null; academic_stress: number | null } | null;
  todaySoreness: { part: string; severity: number }[];
  energyTrend: EnergyTrend | null;
}) {
  const persistent = self.persistentPart && self.persistentDays >= 3;

  return (
    <div className="space-y-3">
      {energyTrend && (
        <div
          className="rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed"
          style={{
            borderColor: "color-mix(in oklab, var(--status-warning) 45%, transparent)",
            background: "color-mix(in oklab, var(--status-warning) 8%, var(--surface))",
            color: "var(--ink-2)",
          }}
        >
          <span className="font-semibold" style={{ color: "var(--ink)" }}>
            Reported energy has fallen {energyTrend.days} check-ins running
          </span>
          , {energyTrend.from}/10 down to {energyTrend.to}/10. Not a number to act on by itself — a
          pattern worth asking about.
        </div>
      )}
      {persistent && (
        <div
          className="rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed"
          style={{
            borderColor: "color-mix(in oklab, var(--status-warning) 45%, transparent)",
            background: "color-mix(in oklab, var(--status-warning) 8%, var(--surface))",
            color: "var(--ink-2)",
          }}
        >
          <span className="font-semibold" style={{ color: "var(--ink)" }}>
            {self.persistentPart} — sore {self.persistentDays} of the last 7 days
          </span>
          , peaking at {self.persistentPeak}/10
          {self.escalating ? ", and getting worse rather than settling" : ""}. Soreness that keeps
          returning to one area is worth assessing regardless of what the load numbers say.
        </div>
      )}

      {!self.hasData && (
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
          No check-ins on record — nothing is known about how this athlete actually feels. The score
          above is built from training and recovery data alone.
        </p>
      )}

      {todayCheckin ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
          <PatternRow
            label="Soreness today"
            value={
              todaySoreness.length
                ? todaySoreness.map((s) => `${s.part} ${s.severity}/10`).join(", ")
                : "none reported"
            }
            warn={todaySoreness.some((s) => s.severity >= 5)}
          />
          <PatternRow label="Energy" value={todayCheckin.energy !== null ? `${todayCheckin.energy}/10` : "—"} warn={(todayCheckin.energy ?? 10) <= 4} />
          <PatternRow label="Session RPE" value={todayCheckin.rpe !== null ? `${todayCheckin.rpe}/10` : "—"} warn={false} />
          <PatternRow label="Academic stress" value={todayCheckin.academic_stress ? "YES" : "no"} warn={Boolean(todayCheckin.academic_stress)} />
        </div>
      ) : (
        self.hasData && (
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
            {self.daysSinceReport === 1
              ? "No check-in today — yesterday was their last."
              : `No check-in today; their last was ${self.daysSinceReport} days ago.`}{" "}
            Nothing logged is not the same as nothing wrong.
          </p>
        )
      )}
    </div>
  );
}

function CStat({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <div className="rounded-2xl border p-4 relative" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
        {label}
        {info && <InfoDot text={info} label={label} />}
      </div>
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
          [
            "Resting HR",
            r.restingHr !== null ? `${r.restingHr} bpm` : "—",
            r.restingHrDelta !== null ? `${r.restingHrDelta > 0 ? "+" : ""}${r.restingHrDelta} vs base` : null,
            rhrColor,
            "Their resting heart rate from Apple Health, and how far it sits from their own recent baseline. Sitting 5 bpm or more above baseline is one of the earliest signs of under-recovery or illness — often days before the athlete notices anything.",
          ],
          [
            "HRV",
            r.hrv !== null ? `${r.hrv} ms` : "—",
            r.hrvDeltaPct !== null ? `${r.hrvDeltaPct > 0 ? "+" : ""}${r.hrvDeltaPct}% vs base` : null,
            hrvColor,
            "Heart rate variability — the small timing differences between heartbeats, from Apple Health. Compared only against this athlete's own baseline, never anyone else's, which is why the percentage is the number that matters. The raw ms figure is not comparable between two athletes.",
          ],
          [
            "Sleep (7d avg)",
            r.sleepAvg !== null ? `${r.sleepAvg} h` : "—",
            null,
            sleepColor,
            "Average hours slept across the last 7 nights recorded in Apple Health. Under 7 h turns amber — short sleep is one of the strongest injury and illness signals there is. Shows a dash rather than a stale number when nothing was recorded in the window.",
          ],
          [
            "VO₂max",
            r.vo2max !== null ? `${r.vo2max}` : "—",
            null,
            "var(--ink)",
            "Apple's Cardio Fitness estimate, read straight from Health — RunGuard does not calculate it. It is one of the two inputs to the fitness score.",
          ],
        ] as const).map(([label, value, delta, color, info]) => (
          <div key={label}>
            <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              {label}
              <InfoDot text={info} label={label} />
            </div>
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

