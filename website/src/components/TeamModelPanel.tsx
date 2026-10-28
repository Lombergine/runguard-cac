/**
 * "Learned from this team": the model trained on the roster's own data,
 * scored leave-one-athlete-out, next to the universal formula and to noise,
 * with the features it learned. Figures first, one sentence, method behind
 * a disclosure. Describes, never instructs.
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import type { TeamModel } from "@/lib/teamModel";

const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const muted = { color: "var(--ink-muted)" } as const;

export default function TeamModelPanel({ model, sampleTeam }: { model: TeamModel; sampleTeam: boolean }) {
  const r = model.result;
  const sign = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`;
  const verdict = r
    ? r.auc > r.noiseCiHigh && r.deltaCiLow > 0
      ? `Beats the universal formula by ${sign(r.deltaRatio)} AUC (${sign(r.deltaCiLow)} to ${sign(r.deltaCiHigh)}, paired bootstrap), and beats noise.`
      : r.deltaCiHigh < 0
        ? `The universal formula does better on this team, by ${sign(-r.deltaRatio)} AUC (${sign(-r.deltaCiHigh)} to ${sign(-r.deltaCiLow)}, paired bootstrap). The panel reports that rather than hiding it.`
        : r.auc > r.noiseCiHigh
        ? `Beats noise. Its gap over the formula, ${sign(r.deltaRatio)} AUC (${sign(r.deltaCiLow)} to ${sign(r.deltaCiHigh)}), includes zero.`
        : "Nothing here separates injury weeks from the rest beyond noise. With this much data, no formula and no model should claim to."
    : null;
  const maxW = r ? Math.max(...r.coefficients.map((c) => Math.abs(c.weight)), 1e-9) : 1;

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-sm font-semibold">Learned from this team</h2>
        <span className="text-xs" style={muted}>
          {model.athletes} athletes · {model.rows.toLocaleString()} athlete-days{r ? ` · trained in ${(r.elapsedMs / 1000).toFixed(1)} s` : ""}
        </span>
      </div>

      {!r ? (
        <p className="text-sm" style={muted}>{model.reason}</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-3 mb-3">
            <Tile label="Learned model" value={f2(r.auc)} sub={`AUC · ${f2(r.aucCiLow)} to ${f2(r.aucCiHigh)}`} strong />
            <Tile label="Universal ratio" value={f2(r.ratioAuc)} sub="AUC, same labels" />
            <Tile label="Noise ratio" value={f2(r.noiseAuc)} sub={`AUC · ${f2(r.noiseCiLow)} to ${f2(r.noiseCiHigh)}`} />
          </div>
          <p className="text-sm mb-4">{verdict}</p>

          <div className="text-xs uppercase tracking-wide mb-2" style={muted}>What it learned</div>
          <ul className="space-y-1.5">
            {r.coefficients.slice(0, 6).map((c) => (
              <li key={c.key} className="flex items-center gap-3 text-sm">
                <span className="w-56 shrink-0">{c.label}</span>
                <span className="flex-1 h-2 rounded" style={{ background: "var(--surface-2)" }}>
                  <span
                    className="block h-2 rounded"
                    style={{
                      width: `${(Math.abs(c.weight) / maxW) * 100}%`,
                      background: c.weight >= 0 ? "var(--status-caution, #f59e0b)" : "var(--brand, #2C4C8C)",
                    }}
                  />
                </span>
                <span className="w-14 text-right tabular-nums" style={muted}>{c.weight >= 0 ? "+" : "−"}{Math.abs(c.weight).toFixed(2)}</span>
              </li>
            ))}
          </ul>

          <details className="mt-3 text-xs" style={muted}>
            <summary className="cursor-pointer select-none" style={{ color: "var(--brand-text, var(--ink))" }}>Details</summary>
            <p className="mt-2">
              L2-regularised logistic regression on twelve readings the app already has, standardised within each athlete and per training fold, {r.iterations} gradient steps. Each athlete is scored by a model that never saw them ({r.folds} folds). The three AUCs use the same labels, an injury logged within the next seven days, with the fortnight after each injury dropped. Weights are standardised; a positive weight raises the week-before-injury odds.
              {sampleTeam
                ? " Sample team: the injuries were generated from load spikes, soreness and poor recovery, so a model that finds those is finding the generator. On a real team it finds the team."
                : " Descriptive, not a diagnosis: this says what this team's past looks like, not what will happen to anyone."}
            </p>
          </details>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub, strong }: { label: string; value: string; sub: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--hairline)", background: "var(--surface-2)" }}>
      <div className="text-xs uppercase tracking-wide" style={muted}>{label}</div>
      <div className="text-2xl font-bold tabular-nums leading-none mt-1" style={strong ? { color: "var(--brand-text, var(--ink))" } : undefined}>{value}</div>
      <div className="text-xs mt-1" style={muted}>{sub}</div>
    </div>
  );
}
