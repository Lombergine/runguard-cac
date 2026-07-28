import { CoreProfile } from "@/lib/profile";
import {
  AcwrChart,
  LoadChart,
  WeeklyKmChart,
  PaceChart,
  FitnessChart,
  SleepChart,
  PRChart,
  MentalChart,
} from "@/components/charts";
import IntensityCalendar from "@/components/IntensityCalendar";
import Gauge from "@/components/Gauge";
import AthleteModel from "./AthleteModel";
import { CheckinWidget, PlanStatusButtons, ChatBox, RaceLogForm, CopyToken, TeamMembership } from "./widgets";

/* ---------------- shared bits ---------------- */

export function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {note && <span className="text-xs" style={{ color: "var(--ink-muted)" }}>{note}</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: color ?? "var(--ink)" }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "var(--ink-muted)" }}>{sub}</div>}
    </div>
  );
}

const zoneColor = (z: "ready" | "caution" | "high") =>
  z === "high" ? "var(--status-critical)" : z === "caution" ? "var(--status-warning)" : "var(--status-good)";

/* tinted surface + border + glow for a given status color — makes risk "punch" on light theme */
function riskSurface(color: string, strong = false) {
  return {
    background: `color-mix(in oklab, ${color} ${strong ? 12 : 7}%, var(--surface))`,
    borderColor: `color-mix(in oklab, ${color} ${strong ? 50 : 30}%, transparent)`,
    boxShadow: strong
      ? `0 0 0 1px color-mix(in oklab, ${color} 30%, transparent), 0 14px 34px -14px color-mix(in oklab, ${color} 55%, transparent)`
      : undefined,
  } as React.CSSProperties;
}

type Block = { label: string; text: string; accent?: boolean };

/* derive Warm-up / Main / Cool-down blocks for a plan day (Runna-style cards) */
function workoutBlocks(d: {
  type: string;
  distanceKm: number | null;
  targetPace: string | null;
  details: string;
}): Block[] {
  const t = d.type.toLowerCase();
  if (t.includes("rest")) return [];
  if (t.includes("race day")) {
    return [
      { label: "Warm-up", text: "20 min build + 4× strides, finishing 12–15 min before the gun." },
      { label: "Race", text: d.details, accent: true },
    ];
  }
  const isWorkout = t.includes("workout") || t.includes("tempo") || t.includes("×") || t.includes("interval") || t.includes("race-pace") || t.includes("400");
  const main: Block = {
    label: "Main set",
    text: `${d.distanceKm ? `${d.distanceKm} km` : ""}${d.targetPace ? ` @ ${d.targetPace}` : ""}${d.distanceKm || d.targetPace ? " — " : ""}${d.details}`,
    accent: true,
  };
  if (!isWorkout) {
    // easy/steady runs: single block + a strides note if the type mentions strides
    const blocks = [main];
    if (t.includes("stride")) blocks.push({ label: "Finish", text: "Relaxed strides on grass, walk-back recovery — turnover, not effort." });
    return blocks;
  }
  return [
    { label: "Warm-up", text: "1.5 km easy jog + leg swings, A-skips, and 3 build-ups to open the legs." },
    main,
    { label: "Cool-down", text: "1 km easy jog + light stretching while you're still warm." },
  ];
}

function WorkoutBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => (
        <div
          key={i}
          className="flex gap-3 rounded-xl px-3 py-2.5"
          style={{
            background: b.accent ? "color-mix(in oklab, var(--brand) 8%, var(--surface-2))" : "var(--surface-2)",
          }}
        >
          <span
            className="text-[10px] font-bold uppercase tracking-wide shrink-0 w-20 pt-0.5"
            style={{ color: b.accent ? "var(--brand-strong)" : "var(--ink-muted)" }}
          >
            {b.label}
          </span>
          <span className="text-sm leading-snug" style={{ color: "var(--ink-2)" }}>{b.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- HOME ---------------- */

/* one bento tile: a metric with optional delta + accent */
function BentoTile({
  label,
  value,
  unit,
  sub,
  accent,
  i,
  big,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  accent?: string;
  i: number;
  big?: boolean;
}) {
  return (
    <div
      className="enter rounded-2xl border p-4 flex flex-col justify-between"
      style={{ ["--i" as string]: i, borderColor: "var(--hairline)", background: "var(--surface)" }}
    >
      <div className="micro-label" style={{ color: "var(--ink-muted)" }}>{label}</div>
      <div className={`${big ? "text-4xl" : "text-3xl"} font-extrabold tabular-nums mt-2 leading-none`} style={{ color: accent ?? "var(--ink)" }}>
        {value}
        {unit && <span className="text-sm font-semibold ml-1" style={{ color: "var(--ink-muted)" }}>{unit}</span>}
      </div>
      {sub && <div className="text-xs mt-1.5" style={{ color: "var(--ink-muted)" }}>{sub}</div>}
    </div>
  );
}

export function HomeTab({ p }: { p: CoreProfile }) {
  const z = zoneColor(p.risk.zone);
  const nextRace = p.races.upcoming[0] ?? null;
  const today = p.plan.days.find((d) => d.isToday);
  const rawPct = Math.round((p.risk.weekKm / p.weeklyTargetKm) * 100);
  const pct = Math.min(100, rawPct);
  const r = p.risk.recovery;
  const high = p.risk.zone === "high";
  const verdict = p.risk.zone === "ready" ? "Good to go" : p.risk.zone === "caution" ? "Train with care" : "High risk today";
  const todayBlocks = today ? workoutBlocks(today) : [];

  return (
    <div className="space-y-4">
      {/* HERO — one number that answers "how should I train today?", with the coaching inside it */}
      <div
        className="enter card-ember rounded-2xl p-6 flex flex-wrap items-center gap-6 glow-ember"
        style={{ ["--i" as string]: 0, ...riskSurface(z, high) }}
      >
        <Gauge value={p.readiness} color={z} size={132} stroke={10} label="readiness" />
        <div className="flex-1 min-w-60">
          <div className="text-2xl font-extrabold" style={{ color: z }}>{verdict}</div>
          <p className="text-base mt-1.5 leading-relaxed" style={{ color: "var(--ink-2)" }}>
            <span className="text-ember font-semibold">RunGuard AI: </span>
            {p.aiInsight}
          </p>
        </div>
        {nextRace && (
          <div className="text-center rounded-xl border px-5 py-3" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
            <div className="text-3xl font-extrabold tabular-nums text-shine">{nextRace.daysUntil}</div>
            <div className="text-xs" style={{ color: "var(--ink-muted)" }}>days to<br />{nextRace.name}</div>
          </div>
        )}
      </div>

      {/* BENTO — glanceable numbers, mixed sizes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BentoTile
          i={1}
          label="Injury risk"
          value={String(p.risk.score)}
          unit="/100"
          sub={verdict}
          accent={z}
          big
        />
        <BentoTile
          i={2}
          label="Sleep · 7d"
          value={r.sleepAvg !== null ? String(r.sleepAvg) : "—"}
          unit={r.sleepAvg !== null ? "h" : undefined}
          sub={r.sleepAvg !== null && r.sleepAvg < 7.5 ? "below 8h target" : "on target"}
          accent={r.sleepAvg !== null && r.sleepAvg < 7 ? "var(--status-warning)" : undefined}
        />
        <BentoTile
          i={3}
          label="HRV"
          value={r.hrv !== null ? String(r.hrv) : "—"}
          unit={r.hrv !== null ? "ms" : undefined}
          sub={r.hrvDeltaPct !== null ? `${r.hrvDeltaPct > 0 ? "+" : ""}${r.hrvDeltaPct}% vs base` : "trend vs baseline"}
          accent={r.hrvDeltaPct !== null && r.hrvDeltaPct <= -12 ? "var(--status-critical)" : undefined}
        />
        <BentoTile
          i={4}
          label="Resting HR"
          value={r.restingHr !== null ? String(r.restingHr) : "—"}
          unit={r.restingHr !== null ? "bpm" : undefined}
          sub={r.restingHrDelta !== null ? `${r.restingHrDelta > 0 ? "+" : ""}${r.restingHrDelta} vs base` : "morning resting"}
          accent={r.restingHrDelta !== null && r.restingHrDelta >= 5 ? "var(--status-critical)" : undefined}
        />
      </div>

      {/* weekly mileage progress — wide */}
      <div className="enter" style={{ ["--i" as string]: 5 }}>
        <Panel title="Weekly mileage" note={`${p.risk.weekKm} of ${p.weeklyTargetKm} km target`}>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
            <div
              className="h-full rounded-full bar-fill"
              style={{
                width: `${pct}%`,
                background: rawPct > 115 ? "var(--status-warning)" : "var(--ember)",
                boxShadow: rawPct > 115 ? "0 0 10px rgba(250,178,25,0.35)" : "0 0 10px rgba(245,158,11,0.3)",
              }}
            />
          </div>
          <div className="text-xs mt-2" style={{ color: rawPct > 115 ? "var(--status-warning)" : "var(--ink-muted)" }}>
            {rawPct}% of weekly target{rawPct > 115 ? " — well over plan, this is the spike RunGuard is flagging" : ""}
          </div>
        </Panel>
      </div>

      {/* today's workout — Runna-style blocks */}
      {today && (
        <div className="enter" style={{ ["--i" as string]: 6 }}>
          <Panel
            title={today.type === "Rest" ? "Today · Rest day" : `Today · ${today.type}`}
            note={today.isTaper ? "Taper mode" : today.day}
          >
            {todayBlocks.length ? (
              <WorkoutBlocks blocks={todayBlocks} />
            ) : (
              <p className="text-sm" style={{ color: "var(--ink-2)" }}>{today.details}</p>
            )}
            <p className="text-xs mt-3" style={{ color: "var(--ink-muted)" }}>Why: {today.why}</p>
          </Panel>
        </div>
      )}

      {/* quick soreness check-in */}
      <div className="enter" style={{ ["--i" as string]: 7 }}>
        <Panel title="Quick check-in">
          <CheckinWidget athleteId={p.athlete.id} current={p.todayCheckin?.soreness_severity ?? null} />
        </Panel>
      </div>

      {/* notifications */}
      {p.notifications.length > 0 && (
        <div className="enter" style={{ ["--i" as string]: 8 }}>
          <Panel title="Notifications">
            <div className="space-y-2.5">
              {p.notifications.map((n, i) => (
                <div key={i} className="flex gap-2.5 items-start text-sm" style={{ color: "var(--ink-2)" }}>
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.severity === "critical" ? "dot-alert" : ""}`}
                    style={{ background: n.severity === "critical" ? "var(--status-critical)" : n.severity === "warning" ? "var(--status-warning)" : "var(--series-1)" }}
                  />
                  {n.text}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

/* ---------------- TRAINING ---------------- */

export function TrainingTab({ p }: { p: CoreProfile }) {
  return (
    <div className="space-y-4">
      {p.plan.taperMode && (
        <div className="rounded-2xl border px-5 py-4 flex items-center gap-3" style={{ borderColor: "var(--brand)", background: "color-mix(in oklab, var(--brand) 10%, var(--surface))" }}>
          <span className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--brand-strong)" }}>{p.plan.taperCountdown}</span>
          <div>
            <div className="text-sm font-semibold">Taper mode is active</div>
            <div className="text-xs" style={{ color: "var(--ink-2)" }}>Race week detected — your plan below is automatically adjusted day by day until race day.</div>
          </div>
        </div>
      )}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold">This week&apos;s plan</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--ink-muted)" }}>Monday through Sunday · auto-built from your load, fitness, and race schedule</p>
        </div>
        {p.plan.days.map((d) => (
          <details key={d.date} className="border-t group" style={{ borderColor: "var(--hairline)" }} open={d.isToday}>
            <summary className="px-5 py-3.5 flex flex-wrap items-center gap-3 cursor-pointer list-none">
              <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-wide" style={{ color: d.isToday ? "var(--brand-strong)" : "var(--ink-muted)" }}>
                {d.day.slice(0, 3)}{d.isToday ? " ·now" : ""}
              </span>
              <span className="flex-1 min-w-40">
                <span className="text-sm font-medium">{d.type}</span>
                <span className="text-xs ml-2" style={{ color: "var(--ink-muted)" }}>
                  {d.distanceKm ? `${d.distanceKm} km` : ""}{d.targetPace ? ` @ ${d.targetPace}` : ""}
                </span>
              </span>
              {d.isTaper && <span className="text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: "rgba(245,158,11,0.15)", color: "var(--brand-strong)" }}>taper</span>}
              <PlanStatusButtons athleteId={p.athlete.id} date={d.date} status={d.status} />
            </summary>
            <div className="px-5 pb-4 sm:pl-[7.25rem] text-sm space-y-2.5" style={{ color: "var(--ink-2)" }}>
              {(() => {
                const blocks = workoutBlocks(d);
                return blocks.length ? <WorkoutBlocks blocks={blocks} /> : <p>{d.details}</p>;
              })()}
              <p className="text-xs" style={{ color: "var(--ink-muted)" }}>Why: {d.why}</p>
              {d.supplemental && (
                <p className="text-xs" style={{ color: "var(--brand-strong)" }}>+ Supplemental — {d.supplemental}</p>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

/* ---------------- STATS ---------------- */

export function StatsTab({ p }: { p: CoreProfile }) {
  const hotspots = [
    ...p.injuries.map((i) => ({ part: i.body_part, kind: "injury" as const })),
    ...(p.todayCheckin?.soreness_part
      ? [{ part: p.todayCheckin.soreness_part, severity: p.todayCheckin.soreness_severity, kind: "soreness" as const }]
      : []),
  ];
  return (
    <div className="space-y-4">
      {/* hero: rotating 3D athlete on the left, headline stats on the right */}
      <div className="grid lg:grid-cols-[1.05fr_1fr] gap-4 items-stretch">
        <AthleteModel readiness={p.readiness} zone={p.risk.zone} hotspots={hotspots} />
        <div className="grid grid-cols-2 gap-3 content-start">
          <Stat label="Fitness score" value={String(p.fitness.score)} sub={`${p.fitness.trend} · ${p.fitness.tier} tier`} color={p.fitness.trend === "improving" ? "var(--status-good)" : undefined} />
          <Stat label="VO₂max" value={p.fitness.vo2max !== null ? String(p.fitness.vo2max) : "—"} sub="Apple Cardio Fitness" />
          <Stat label="Week TRIMP" value={String(p.load.weekTrimp)} sub="training impulse" />
          <Stat label="Injury risk" value={`${p.risk.score}`} sub={`${p.risk.zone} zone`} color={p.risk.zone === "high" ? "var(--status-critical)" : p.risk.zone === "caution" ? "var(--status-warning)" : "var(--status-good)"} />
          <Stat label="7-day km" value={`${p.risk.weekKm}`} sub={`target ${p.weeklyTargetKm}`} />
          <Stat label="Longest streak" value={`${p.badges.find((b) => b.id === "streak7")?.detail.replace("Longest streak: ", "") ?? "—"}`} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Pace trend — season" note="up = faster"><PaceChart data={p.paceSeason} /></Panel>
        <Panel title="Fitness score trend" note="improving or plateauing?"><FitnessChart data={p.fitness.weekly} /></Panel>
        <Panel title="Weekly mileage"><WeeklyKmChart data={p.weeks} /></Panel>
        <Panel title="ACWR — your injury risk over time" note="band = safe zone · dashed = danger"><AcwrChart data={p.series.slice(-60)} /></Panel>
      </div>

      <Panel title="Training load history" note="spot exactly when you spiked"><LoadChart data={p.series.slice(-60)} /></Panel>

      {/* HR zones */}
      <Panel title="Time in HR zones — this week" note={`${Object.values(p.load.weekZones).reduce((s, x) => s + x, 0)} total minutes`}>
        <div className="flex h-6 rounded-lg overflow-hidden" style={{ background: "var(--surface-2)" }}>
          {(["z1", "z2", "z3", "z4", "z5"] as const).map((z, i) => {
            const total = Object.values(p.load.weekZones).reduce((s, x) => s + x, 0) || 1;
            const w = (p.load.weekZones[z] / total) * 100;
            const colors = ["#3987e5", "#199e70", "#c98500", "#ec835a", "#d03b3b"];
            return w > 0 ? <div key={z} style={{ width: `${w}%`, background: colors[i] }} title={`${z.toUpperCase()}: ${p.load.weekZones[z]} min`} /> : null;
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-2 text-xs" style={{ color: "var(--ink-muted)" }}>
          {(["z1", "z2", "z3", "z4", "z5"] as const).map((z, i) => (
            <span key={z} className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: ["#3987e5", "#199e70", "#c98500", "#ec835a", "#d03b3b"][i] }} />
              {z.toUpperCase()} {p.load.weekZones[z]}m
            </span>
          ))}
        </div>
      </Panel>

      {/* PRs + predictions */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
        <div className="px-5 py-4 text-sm font-semibold">PRs & predicted times</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
              <th className="px-5 py-2 font-medium">Event</th>
              <th className="px-3 py-2 font-medium text-right">PR</th>
              <th className="px-3 py-2 font-medium text-right">Predicted now</th>
              <th className="px-5 py-2 font-medium text-right hidden sm:table-cell">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {p.prs.map((pr) => {
              const pred = p.predictions[pr.event];
              const faster = pr.timeS !== null && pred.timeS < pr.timeS;
              return (
                <tr key={pr.event} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                  <td className="px-5 py-2.5 font-medium">{pr.event}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "var(--ink-2)" }}>{pr.label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: faster ? "var(--status-good)" : "var(--ink)" }}>{pred.label}</td>
                  <td className="px-5 py-2.5 text-right text-xs hidden sm:table-cell" style={{ color: faster ? "var(--status-good)" : "var(--ink-muted)" }}>
                    {pr.timeS === null ? "race it to set a PR" : faster ? "PR predicted ✓" : "keep building"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Panel title="Your training year" note="How hard you went, every single day">
        <IntensityCalendar days={p.yearDays} />
      </Panel>
    </div>
  );
}

/* ---------------- RECOVERY ---------------- */

export function RecoveryTab({ p }: { p: CoreProfile }) {
  const r = p.risk.recovery;
  const z = zoneColor(p.risk.zone);
  const stages = p.sleep30.slice(-7);
  const avg = (k: "deep" | "rem" | "light") => {
    const v = stages.map((s) => s[k]).filter((x): x is number => x != null);
    return v.length ? (v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : "—";
  };
  const tips: string[] = [];
  if (r.sleepAvg !== null && r.sleepAvg < 7.5) tips.push(`Your sleep is low (${r.sleepAvg}h avg) — prioritize 8 hours tonight${p.plan.days.some((d) => d.type.includes("Workout") && !d.status) ? " before your next hard workout" : ""}.`);
  if (r.hrvDeltaPct !== null && r.hrvDeltaPct <= -12) tips.push("HRV is suppressed — today should be genuinely easy; it rebounds fastest with sleep + low intensity.");
  if (p.patterns.sleepDebtH !== null && p.patterns.sleepDebtH > 4) tips.push(`You're carrying ${p.patterns.sleepDebtH}h of sleep debt this week — one early night erases half of it.`);
  if (p.illness) tips.push("HRV drop + elevated resting HR looks like your body fighting something. Hydrate, sleep, and skip intensity for 48h.");
  tips.push("Hydration: start sipping now, not at practice. Before hard days and race days: extra water + electrolytes with lunch.");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-5 flex flex-wrap items-center gap-6" style={{ borderColor: "color-mix(in oklab, " + z + " 45%, transparent)", background: "color-mix(in oklab, " + z + " 8%, var(--surface))" }}>
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>Today&apos;s recovery status</div>
          <div className="text-2xl font-extrabold mt-0.5" style={{ color: z }}>
            {p.risk.zone === "ready" ? "Green — recovered" : p.risk.zone === "caution" ? "Yellow — partial" : "Red — under-recovered"}
          </div>
        </div>
        <div className="flex-1" />
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>Injury risk</div>
          <div className="text-3xl font-extrabold tabular-nums" style={{ color: z }}>{p.risk.score}<span className="text-base" style={{ color: "var(--ink-muted)" }}>/100</span></div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Sleep (7d avg)" value={r.sleepAvg !== null ? `${r.sleepAvg} h` : "—"} color={r.sleepAvg !== null && r.sleepAvg < 7 ? "var(--status-warning)" : undefined} />
        <Stat label="HRV" value={r.hrv !== null ? `${r.hrv} ms` : "—"} sub={r.hrvDeltaPct !== null ? `${r.hrvDeltaPct > 0 ? "+" : ""}${r.hrvDeltaPct}% vs base` : undefined} color={r.hrvDeltaPct !== null && r.hrvDeltaPct <= -12 ? "var(--status-critical)" : undefined} />
        <Stat label="Resting HR" value={r.restingHr !== null ? `${r.restingHr} bpm` : "—"} sub={r.restingHrDelta !== null ? `${r.restingHrDelta > 0 ? "+" : ""}${r.restingHrDelta} vs base` : undefined} color={r.restingHrDelta !== null && r.restingHrDelta >= 5 ? "var(--status-critical)" : undefined} />
        <Stat label="Body battery" value={String(p.fitness.freshness)} sub="freshness 0-100" />
        <Stat label="Sleep consistency" value={p.patterns.sleepConsistency !== null ? `${p.patterns.sleepConsistency}` : "—"} sub="same bedtime = higher" />
      </div>

      {/* what's driving the risk score */}
      <Panel title={`What's driving your ${p.risk.score}/100`}>
        <div className="space-y-2.5">
          {p.risk.insights.map((line, i) => (
            <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>{line}</p>
          ))}
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Sleep — last 30 days" note="dashed line = 8h target">
          <SleepChart data={p.sleep30.map((s) => ({ date: s.date, hours: s.hours }))} />
        </Panel>
        <Panel title="Sleep stages — 7-day average" note="from Apple Watch">
          <div className="space-y-3 pt-2">
            {([["Deep", avg("deep"), "#3987e5"], ["REM", avg("rem"), "#9085e9"], ["Light", avg("light"), "#199e70"]] as const).map(([label, val, color]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-12 text-xs" style={{ color: "var(--ink-muted)" }}>{label}</span>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, parseFloat(val as string) * 22 || 0)}%`, background: color }} />
                </div>
                <span className="text-sm tabular-nums font-medium w-12 text-right">{val} h</span>
              </div>
            ))}
            <p className="text-xs pt-1" style={{ color: "var(--ink-muted)" }}>
              SpO₂ {p.sleep30.length ? "≈ 97-98%" : "—"} · wrist temp & respiratory rate tracked nightly for illness detection
            </p>
          </div>
        </Panel>
      </div>

      <Panel title="Recovery tips — based on today's data">
        <div className="space-y-2">
          {tips.map((t, i) => (
            <p key={i} className="text-sm leading-relaxed flex gap-2" style={{ color: "var(--ink-2)" }}>
              <span style={{ color: "var(--brand-strong)" }}>→</span>{t}
            </p>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- RACE ---------------- */

export function RaceTab({ p }: { p: CoreProfile }) {
  return (
    <div className="space-y-4">
      {/* upcoming */}
      {p.races.upcoming.map((r) => (
        <div key={r.id} className="rounded-2xl border p-5" style={{ borderColor: r.daysUntil <= 7 ? "var(--brand)" : "var(--hairline)", background: "var(--surface)" }}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-center rounded-xl border px-4 py-2" style={{ borderColor: "var(--hairline)" }}>
              <div className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--brand-strong)" }}>{r.daysUntil}</div>
              <div className="text-[10px] uppercase" style={{ color: "var(--ink-muted)" }}>days</div>
            </div>
            <div className="flex-1 min-w-40">
              <div className="font-semibold">{r.name}</div>
              <div className="text-xs" style={{ color: "var(--ink-muted)" }}>{r.event} · {r.location} · {new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>Race readiness</div>
              <div className="text-xl font-bold tabular-nums" style={{ color: r.readiness >= 70 ? "var(--status-good)" : r.readiness >= 40 ? "var(--status-warning)" : "var(--status-critical)" }}>{r.readiness}/100</div>
            </div>
          </div>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-muted)" }}>Pacing strategy · predicted {r.predicted}</div>
              {r.pacing.map((line, i) => (
                <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>• {line}</p>
              ))}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-muted)" }}>Pre-race checklist</div>
              {["8+ hours of sleep the two nights before", "Carbs + water with every meal the day prior", "Kit laid out the night before", "20 min warmup + 4 strides, done 15 min before the gun"].map((c, i) => (
                <p key={i} className="text-sm leading-relaxed flex gap-2" style={{ color: "var(--ink-2)" }}><span style={{ color: "var(--status-good)" }}>☐</span>{c}</p>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* post race log */}
      <Panel title="Log a race result">
        <RaceLogForm athleteId={p.athlete.id} events={["800m", "Mile", "5K", "XC 5K"]} />
      </Panel>

      {/* PR progression */}
      <div className="grid lg:grid-cols-2 gap-4">
        {Object.entries(p.races.prProgression).map(([ev, prog]) => (
          <Panel key={ev} title={`${ev} PR progression`} note="every step down is a PR">
            <PRChart data={prog} event={ev} />
          </Panel>
        ))}
      </div>

      {/* history */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
        <div className="px-5 py-4 text-sm font-semibold">Race history</div>
        <table className="w-full text-sm">
          <tbody>
            {p.races.history.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                <td className="px-5 py-2.5" style={{ color: "var(--ink-2)" }}>{new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}</td>
                <td className="px-3 py-2.5 font-medium">{r.event}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{r.time}{r.isPr && <span className="ml-1.5 text-[10px] font-bold rounded-full px-1.5 py-0.5" style={{ background: "rgba(245,158,11,0.2)", color: "var(--brand-strong)" }}>PR</span>}</td>
                <td className="px-3 py-2.5 text-right tabular-nums hidden sm:table-cell" style={{ color: "var(--ink-2)" }}>{r.place ? `#${r.place}` : ""}</td>
                <td className="px-3 py-2.5 text-xs hidden md:table-cell" style={{ color: "var(--ink-muted)" }}>{r.splits ? "splits: " + r.splits.map((s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`).join(" / ") : ""}</td>
                <td className="px-5 py-2.5 text-xs text-right hidden lg:table-cell" style={{ color: "var(--ink-muted)" }}>{r.conditions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- CHAT ---------------- */

export function ChatTab({ p }: { p: CoreProfile }) {
  return (
    <Panel title="Ask RunGuard AI" note="reads your last 14 days automatically · coach sees a summary">
      <ChatBox athleteId={p.athlete.id} />
    </Panel>
  );
}

/* ---------------- PROFILE ---------------- */

export function ProfileTab({ p }: { p: CoreProfile }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="School" value={p.athlete.school.split(" ")[0]} sub={p.athlete.school} />
        <Stat label="Grade" value={String(p.athlete.grade ?? "—")} />
        <Stat label="Events" value={String(p.athlete.events.length)} sub={p.athlete.events.join(" · ")} />
        <Stat label="Fitness tier" value={p.fitness.tier} />
      </div>

      <Panel title="Team" note={p.athlete.teamName ? "you're on a team" : "you're solo"}>
        <TeamMembership teamName={p.athlete.teamName} />
      </Panel>

      {p.athlete.deviceToken && (
        <Panel title="Pair the RunGuard iPhone app" note="turns on live background sync">
          <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--ink-2)" }}>
            Install <b>RunGuard</b> on your iPhone, open it, enter your team&apos;s web address, then paste
            this pairing token. Grant Apple Health access once and it syncs on its own from then on.
          </p>
          <CopyToken token={p.athlete.deviceToken} />
          <p className="text-xs mt-2" style={{ color: "var(--ink-muted)" }}>
            Keep this private — it links the app to your account.
          </p>
        </Panel>
      )}

      <Panel title="How your data syncs" note="Apple Health is the hub">
        <div className="flex items-center gap-3 mb-4">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: p.connectedSources.includes("Apple Watch") ? "var(--status-good)" : "var(--ink-muted)" }}
          />
          <span className="text-sm font-medium">
            {p.connectedSources.includes("Apple Watch")
              ? "Apple Health — connected & syncing"
              : p.connectedSources.includes("Demo data")
                ? "Demo data (connect the RunGuard app for live data)"
                : "Not synced yet"}
          </span>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Your runs, heart rate, HRV, sleep, and VO₂max flow in <b>live from the RunGuard iPhone app</b>,
          which reads Apple Health in the background — you never have to upload anything. This web app
          is your full dashboard for that data on a bigger screen.
        </p>
        <div className="mt-3 rounded-xl px-4 py-3 text-sm leading-relaxed" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
          <b>Have a Garmin, Coros, Fitbit, or WHOOP?</b> Connect it to Apple Health in that device&apos;s
          app (Garmin Connect → Settings → Apple Health), and every run and night of sleep lands in RunGuard
          automatically — no separate hookup needed.
        </div>
      </Panel>

      <Panel title="Connected apps">
        <div className="flex flex-wrap gap-2">
          {["Apple Health", "Apple Watch", "Garmin", "Strava", "WHOOP"].map((s) => {
            const on =
              (s === "Apple Health" && (p.connectedSources.includes("Apple Watch") || p.connectedSources.includes("Demo data"))) ||
              p.connectedSources.includes(s) ||
              (s === "Apple Watch" && p.connectedSources.includes("Demo data"));
            return (
              <span key={s} className="text-xs rounded-full border px-3 py-1.5 font-medium" style={{ borderColor: on ? "var(--status-good)" : "var(--hairline)", color: on ? "var(--status-good)" : "var(--ink-muted)" }}>
                {on ? "✓ " : ""}{s}{s !== "Apple Health" && s !== "Apple Watch" ? " → Apple Health" : ""}
              </span>
            );
          })}
        </div>
      </Panel>

      <Panel title="Season goals" note="PR targets vs current prediction">
        <table className="w-full text-sm">
          <tbody>
            {p.goals.map((g) => (
              <tr key={g.event} className="border-t first:border-t-0" style={{ borderColor: "var(--hairline)" }}>
                <td className="py-2 font-medium">{g.event}</td>
                <td className="py-2 text-right tabular-nums" style={{ color: "var(--ink-2)" }}>target {g.targetLabel}</td>
                <td className="py-2 text-right tabular-nums" style={{ color: "var(--ink-2)" }}>now {g.predicted ?? "—"}</td>
                <td className="py-2 text-right text-xs" style={{ color: g.onTrack ? "var(--status-good)" : "var(--status-warning)" }}>{g.onTrack ? "on track ✓" : "chasing"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {p.comparison.peers > 0 && (
        <Panel title="Competitor comparison" note={`anonymous · vs ${p.comparison.peers} athletes at your level`}>
          <div className="space-y-3">
            {[["Weekly volume", p.comparison.weekKmPercentile], ["Predicted 5K", p.comparison.fivekPercentile]].map(([label, pct]) => (
              <div key={label as string} className="flex items-center gap-3">
                <span className="w-28 text-xs" style={{ color: "var(--ink-muted)" }}>{label}</span>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--series-1)" }} />
                </div>
                <span className="text-sm tabular-nums font-medium w-24 text-right">{pct}th %ile</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Achievement badges">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {p.badges.map((b) => (
            <div key={b.id} className="rounded-xl border p-3 text-center" style={{ borderColor: b.earned ? "var(--brand)" : "var(--hairline)", opacity: b.earned ? 1 : 0.5 }}>
              <div className="text-2xl">{b.id === "hundred" ? "💯" : b.id === "streak7" ? "🔥" : b.id === "pr" ? "⚡" : "🛡️"}</div>
              <div className="text-xs font-semibold mt-1">{b.label}</div>
              <div className="text-[10px] mt-0.5" style={{ color: "var(--ink-muted)" }}>{b.detail}</div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Injury history" note="RunGuard AI knows your weak spots">
          {p.injuries.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>No injuries logged. Keep it that way.</p>
          ) : (
            <div className="space-y-2.5">
              {p.injuries.map((i) => (
                <div key={i.id} className="text-sm" style={{ color: "var(--ink-2)" }}>
                  <span className="font-medium">{i.body_part}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--ink-muted)" }}>{new Date(i.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  {i.note && <div className="text-xs mt-0.5" style={{ color: "var(--ink-muted)" }}>{i.note}</div>}
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Mental readiness trend" note="energy & motivation from your check-ins">
          <MentalChart data={p.mental30} />
        </Panel>
      </div>
    </div>
  );
}
