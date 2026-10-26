/**
 * RunGuard 2.0 on the web: the same four readings the phone shows on Stats,
 * rendered for the athlete portal and the coach's athlete page from the
 * profile's `audit` (lib/acwrDiagnostics.ts). Nothing here computes a
 * statistic. Advisory language stays advisory: these describe, they do not
 * instruct.
 *
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import type { AthleteAudit } from "@/lib/acwrDiagnostics";
import { Panel } from "./tabs";

const f2 = (x: number) => x.toFixed(2);
const pct = (f: number) => `${(f * 100).toFixed(1)}%`;
function ordinal(p: number): string {
  const r = Math.round(p * 10) / 10;
  const n = Math.floor(r) % 100;
  const suffix = n >= 11 && n <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${Number.isInteger(r) ? r : r.toFixed(1)}${suffix}`;
}

function Headline({ children }: { children: React.ReactNode }) {
  return <span className="text-xl font-bold tabular-nums" style={{ color: "var(--brand-text, var(--ink))" }}>{children}</span>;
}

export default function AuditPanels({ audit, whose = "your" }: { audit?: AthleteAudit | null; whose?: "your" | "their" }) {
  if (!audit) return null;
  const t = audit.threshold;
  const r = audit.rescaling;
  const z = audit.personalZones;
  const enough = audit.usableDays >= audit.personalZonesMinimumDays;
  const findings = audit.quality.findings.filter((f) => f.severity !== "note");
  const muted = { color: "var(--ink-muted)" } as const;
  const Your = whose === "your" ? "Your" : "Their";

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title={`${Your} threshold`} note="where the universal 1.5 sits in this history">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm">
              {t ? (
                <>
                  The universal 1.5 cutoff flags <b>{pct(t.referenceFlaggedFraction)}</b> of {whose} days — the {ordinal(t.referencePercentile)} percentile. {Your} own 95th percentile is <b>{f2(t.percentiles["95"])}</b>.
                  {z
                    ? ` ${Your} own cut points, the 90th at ${f2(z.caution)} and the 95th at ${f2(z.high)}, are drawn on the workload chart in violet.`
                    : ` Personal cut points appear once ${audit.personalZonesMinimumDays} days carry a ratio (${t.n} so far).`}
                </>
              ) : (
                <>A personal threshold needs days that carry a ratio; {audit.days} days of history so far, none with a ratio yet.</>
              )}
            </p>
            {t ? <Headline>{f2(t.percentiles["95"])}</Headline> : null}
          </div>
          {t ? (
            <div className="mt-3 grid grid-cols-5 text-center">
              {["50", "75", "90", "95", "99"].map((p) => (
                <div key={p}>
                  <div className="text-[11px] uppercase tracking-wide" style={muted}>{p}th</div>
                  <div className="text-sm font-semibold tabular-nums">{f2(t.percentiles[p])}</div>
                </div>
              ))}
            </div>
          ) : null}
          <p className="text-xs mt-3" style={muted}>
            Every running app applies 1.5 to everyone (Gabbett, 2016). A threshold from one athlete&rsquo;s own distribution flags a fixed share of their days by construction: it shows how arbitrary the universal number is, it is not a validated predictor of injury.
          </p>
        </Panel>

        <Panel title="Self-audit" note="how much of the score is just the last 7 days">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm">
              {!r ? (
                <>The audit needs days that carry a ratio: {audit.usableDays} so far, it unlocks at {audit.personalZonesMinimumDays}.</>
              ) : !enough ? (
                <>The audit unlocks at {audit.personalZonesMinimumDays} days with a ratio; {r.n} so far. Below that the number moves too much to mean anything.</>
              ) : (
                <>
                  This score tracks the last 7 days at <b>ρ = {f2(r.spearman)}</b>
                  {r.ciLow != null && !Number.isNaN(r.ciLow) ? ` (CI ${f2(r.ciLow)} to ${f2(r.ciHigh)})` : ""}.{" "}
                  {r.spearman >= 0.9
                    ? "Above 0.9 the score is mostly repeating weekly mileage."
                    : r.spearman >= 0.7
                      ? "Most of this score’s movement is the last 7 days; the 4-week baseline adds some."
                      : "Below 0.7 the 4-week baseline is doing real work in this score."}
                </>
              )}
            </p>
            {r && enough ? <Headline>ρ {f2(r.spearman)}</Headline> : null}
          </div>
          <p className="text-xs mt-3" style={muted}>
            Impellizzeri et al. (2021) showed that replacing the ratio&rsquo;s chronic denominator with noise left its link to injury about the same. This is the label-free version of that test on this athlete&rsquo;s own data: the Spearman rank correlation between the ratio and its own 7-day numerator, with a seeded {r?.draws ?? 500}-resample bootstrap interval.
          </p>
        </Panel>
      </div>

      {findings.length ? (
        <Panel title={audit.quality.ok ? "Data check" : "Not enough history"} note={`${audit.quality.nDays} days · ${audit.quality.nTrainingDays} with a run`}>
          <ul className="space-y-2 text-sm">
            {findings.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span style={{ color: f.severity === "error" ? "var(--status-critical, #ef4444)" : "var(--status-caution, #f59e0b)" }}>{f.severity === "error" ? "✕" : "!"}</span>
                <span>
                  {f.message}
                  {f.dates.length ? <span className="ml-2 text-xs tabular-nums" style={muted}>{f.dates.join(" · ")}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs mt-3" style={muted}>
            Nothing is corrected automatically. Whether a gap was rest or an unsynced watch is the athlete&rsquo;s call, not the app&rsquo;s.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
