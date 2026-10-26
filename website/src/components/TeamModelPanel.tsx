/**
 * "Learned from this team": the model trained on the roster's own data,
 * scored leave-one-athlete-out, next to the universal formula and to noise,
 * with the features it learned. Describes, never instructs.
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import type { TeamModel } from "@/lib/teamModel";

const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const muted = { color: "var(--ink-muted)" } as const;

export default function TeamModelPanel({ model, sampleTeam }: { model: TeamModel; sampleTeam: boolean }) {
  const r = model.result;
  const sign = (x: number) => `${x >= 0 ? "+" : "\u2212"}${Math.abs(x).toFixed(2)}`;
  const verdict = r
    ? r.auc > r.noiseCiHigh && r.deltaCiLow > 0
      ? `A model that learns this team's own patterns separates injury weeks better than the universal formula, by ${sign(r.deltaRatio)} AUC (${sign(r.deltaCiLow)} to ${sign(r.deltaCiHigh)}, paired bootstrap), and better than noise.`
      : r.auc > r.noiseCiHigh
        ? `The learned model beats noise, but its gap over the ratio, ${sign(r.deltaRatio)} AUC (${sign(r.deltaCiLow)} to ${sign(r.deltaCiHigh)}), includes zero: on this roster the extra features add little.`
        : "Nothing here separates injury weeks from the rest beyond noise: with this much data, no formula and no model should claim to."
    : null;
  const maxW = r ? Math.max(...r.coefficients.map((c) => Math.abs(c.weight)), 1e-9) : 1;

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold">Learned from this team</h2>
        <span className="text-xs" style={muted}>
          {model.rows.toLocaleString()} athlete-days · {model.events} injury-week days · {model.athletes} athletes
          {r ? ` · trained in ${r.elapsedMs} ms` : ""}
        </span>
      </div>

      {!r ? (
        <p className="text-sm" style={muted}>{model.reason}</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <Tile label="Learned model" value={f2(r.auc)} sub={`AUC, leave-one-athlete-out · ${f2(r.aucCiLow)} to ${f2(r.aucCiHigh)}`} strong />
            <Tile label="Universal ratio" value={f2(r.ratioAuc)} sub="AUC of the shown ratio, same labels" />
            <Tile label="Noise ratio" value={f2(r.noiseAuc)} sub={`AUC with a shuffled denominator · ${f2(r.noiseCiLow)} to ${f2(r.noiseCiHigh)}`} />
          </div>
          <p className="text-sm mb-4">{verdict}</p>

          <div className="text-xs uppercase tracking-wide mb-2" style={muted}>What it learned · standardised weights, + raises the week-before-injury odds</div>
          <ul className="space-y-1.5">
            {r.coefficients.slice(0, 8).map((c) => (
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
                <span className="w-14 text-right tabular-nums" style={muted}>{c.weight >= 0 ? "+" : ""}{c.weight.toFixed(2)}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs mt-4" style={muted}>
            L2-regularised logistic regression on twelve features the app already computes, standardised per training fold, {r.iterations} gradient steps. Each athlete is scored by a model that never saw them ({r.folds} folds); the three AUCs use the same labels, an injury logged within the next seven days, with the fortnight after each injury dropped.
            {sampleTeam
              ? " On this sample team the injuries were generated to follow load spikes, soreness reports and poor recovery, so a model that finds those is finding the generator; on a real team it finds the team."
              : " Descriptive, not a diagnosis: this says what this team's past looks like, not what will happen to anyone."}
          </p>
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
