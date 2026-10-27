/**
 * RunGuard 2.0 on the web: the same readings the phone shows on Stats,
 * rendered for the athlete portal and the coach's athlete page from the
 * profile's `audit` (lib/acwrDiagnostics.ts). Nothing here computes a
 * statistic. Each panel is a row of figures, at most one sentence, and a
 * "Details" disclosure with the method. Describes, never instructs.
 *
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import type { AthleteAudit } from "@/lib/acwrDiagnostics";
import { Panel } from "./tabs";
import ExplainButton from "./ExplainButton";

const f2 = (x: number) => x.toFixed(2);
const pct = (f: number) => `${(f * 100).toFixed(1)}%`;
const muted = { color: "var(--ink-muted)" } as const;

function Figure({ label, value, caption, strong }: { label: string; value: string; caption?: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide" style={muted}>{label}</div>
      <div className="text-2xl font-bold tabular-nums leading-none mt-1" style={strong ? { color: "var(--brand-text, var(--ink))" } : undefined}>{value}</div>
      {caption ? <div className="text-xs mt-1 truncate" style={muted}>{caption}</div> : null}
    </div>
  );
}

function Figures({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-4 divide-x" style={{ borderColor: "var(--hairline)" }}>{children}</div>;
}

function Details({ children }: { children: React.ReactNode }) {
  return (
    <details className="mt-3 text-xs" style={muted}>
      <summary className="cursor-pointer select-none" style={{ color: "var(--brand-text, var(--ink))" }}>Details</summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  );
}

export default function AuditPanels({ audit, whose = "your", athleteId }: { audit?: AthleteAudit | null; whose?: "your" | "their"; athleteId?: number }) {
  if (!audit) return null;
  const t = audit.threshold;
  const r = audit.rescaling;
  const z = audit.personalZones;
  const enough = audit.usableDays >= audit.personalZonesMinimumDays;
  const findings = audit.quality.findings.filter((f) => f.severity !== "note");
  const Your = whose === "your" ? "Your" : "Their";
  const your = whose;

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title={`${Your} threshold`} note="where 1.5 sits in this history">
          {t ? (
            <>
              <Figures>
                <Figure label="Universal" value="1.50" caption={`flags ${pct(t.referenceFlaggedFraction)} of days`} />
                <Figure label={`${Your} 95th`} value={f2(t.percentiles["95"])} caption={z ? "violet line on the chart" : "hardest 5% of days"} strong />
                {z ? <Figure label={`${Your} 90th`} value={f2(z.caution)} caption="caution" /> : <Figure label="Own lines" value="—" caption={`after ${audit.personalZonesMinimumDays} days (${t.n} so far)`} />}
              </Figures>
              <Details>
                <div className="grid grid-cols-5 text-center">
                  {["50", "75", "90", "95", "99"].map((p) => (
                    <div key={p}>
                      <div className="text-[11px] uppercase tracking-wide">{p}th</div>
                      <div className="text-sm font-semibold tabular-nums" style={{ color: "var(--ink)" }}>{f2(t.percentiles[p])}</div>
                    </div>
                  ))}
                </div>
                <p>
                  Every running app applies the same 1.5 cutoff to everyone (Gabbett, 2016). This reports what 1.5 picks out of {your} own year, and the cut that would flag the hardest 5% of days instead. A cut from one athlete&rsquo;s own history flags a fixed share of days by construction; it shows how arbitrary the universal number is, and is not a validated predictor of injury.
                </p>
              </Details>
            </>
          ) : (
            <p className="text-sm" style={muted}>Needs days with a ratio. {audit.days} days of history so far, none with a ratio yet.</p>
          )}
        </Panel>

        <Panel title="Self-audit" note="how much of the score is just the last 7 days">
          {r && enough ? (
            <>
              <Figures>
                <Figure label="Tracks last 7 days" value={`ρ ${f2(r.spearman)}`} caption={r.ciLow != null && !Number.isNaN(r.ciLow) ? `${f2(r.ciLow)} to ${f2(r.ciHigh)}` : undefined} strong />
                <Figure label="Days" value={String(r.n)} caption="with a ratio" />
                <Figure label="Resamples" value={String(r.draws)} caption="seeded bootstrap" />
              </Figures>
              <p className="text-sm mt-3">
                {r.spearman >= 0.9
                  ? "Above 0.9, the score is weekly mileage on a different scale."
                  : r.spearman >= 0.7
                    ? "Between 0.7 and 0.9, most of the score is the last 7 days."
                    : "Below 0.7, the 4-week baseline is doing real work in the score."}
              </p>
              <Details>
                <p>
                  The ratio is acute load over chronic load. If the 4-week denominator barely changes the order of days, the ratio is a rescaled copy of its own numerator. Impellizzeri et al. (2021) showed that replacing the denominator with noise left the ratio&rsquo;s link to injury about the same. This is the label-free version of that test on this athlete&rsquo;s own data: the Spearman rank correlation between the ratio and its own 7-day numerator. Sports Medicine, 51(3), 581 to 592.
                </p>
              </Details>
            </>
          ) : (
            <p className="text-sm" style={muted}>
              {!r ? `Needs ${audit.personalZonesMinimumDays} days with a ratio. ${audit.usableDays} so far.` : `Unlocks at ${audit.personalZonesMinimumDays} days with a ratio. ${r.n} so far.`}
            </p>
          )}
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
          <Details>
            <p>Checks for history shorter than the 28-day window, no training, outlier days over 3 times the 95th-percentile day, breaks of 10 or more zero days, and suspected unit changes. Nothing is corrected automatically.</p>
          </Details>
        </Panel>
      ) : null}

      <ExplainButton athleteId={athleteId} />
    </div>
  );
}
