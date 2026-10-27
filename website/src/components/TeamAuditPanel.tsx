/**
 * The team audit on the coach's overview: per-athlete score trust, and the
 * Impellizzeri experiment run on this team's own injury log. Figures first,
 * one sentence, method behind a disclosure. Describes, never instructs; a
 * missing result says why.
 *
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import Link from "next/link";
import Avatar from "@/components/Avatar";
import type { TeamAudit } from "@/lib/teamAudit";

const f2 = (x: number) => x.toFixed(2);
const pct = (f: number) => `${(f * 100).toFixed(1)}%`;
const muted = { color: "var(--ink-muted)" } as const;

export default function TeamAuditPanel({ audit }: { audit: TeamAudit }) {
  const c = audit.pooled.comparison;
  const s = audit.summary;
  const n = audit.athletes.length;
  const verdict = c
    ? c.realBeatsNull
      ? "The 4-week baseline is carrying information on this team."
      : c.realOutsideNull
        ? "The real baseline scores below a random one: the paper’s result, reproduced here."
        : "The real ratio sits inside the noise interval. The baseline added nothing on this team, which is the paper’s result."
    : null;

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-sm font-semibold">Can the score be trusted on this team?</h2>
        <span className="text-xs" style={muted}>
          {audit.days} days · {n} athletes · {audit.pooled.events} logged injur{audit.pooled.events === 1 ? "y" : "ies"}
        </span>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Tile
          label="Median self-audit"
          value={s.medianRho !== null ? `ρ ${f2(s.medianRho)}` : "—"}
          sub={s.medianRho !== null ? (s.medianRho >= 0.9 ? "just mileage" : s.medianRho >= 0.7 ? "mostly last week" : "baseline matters") : `${s.withPersonalZones} of ${n} have 60 days with a ratio`}
        />
        <Tile label="1.5 out of reach for" value={`${s.universalAboveOwn99th} of ${n}`} sub="own 99th below 1.5" />
        <Tile label="Own 95th below 1.3" value={`${s.own95thBelowCaution} of ${n}`} sub="1.3 would never warn" />
      </div>

      <div className="rounded-xl border p-4 mb-4" style={{ borderColor: "var(--hairline)", background: "var(--surface-2)" }}>
        <div className="text-xs uppercase tracking-wide mb-3" style={muted}>The Impellizzeri test, on this roster</div>
        {c ? (
          <>
            <div className="grid sm:grid-cols-3 gap-4 mb-3">
              <Figure label="Real ratio" value={f2(c.real)} caption={`AUC · ${f2(c.realCiLow)} to ${f2(c.realCiHigh)}`} strong />
              <Figure label="Noise ratio" value={f2(c.null)} caption={`AUC · ${f2(c.nullCiLow)} to ${f2(c.nullCiHigh)}`} />
              <Figure label="Evidence" value={String(c.nEvents)} caption={`injuries · ${c.n.toLocaleString()} athlete-days`} />
            </div>
            <p className="text-sm">{verdict}</p>
            <details className="mt-2 text-xs" style={muted}>
              <summary className="cursor-pointer select-none" style={{ color: "var(--brand-text, var(--ink))" }}>Details</summary>
              <p className="mt-2">
                Every athlete-day with a ratio, labelled 1 on days an injury was logged. AUC of the shown ratio against those labels, with a bootstrap interval, then the same for a ratio whose 4-week denominator was shuffled into noise ({c.nNullDraws} draws). Descriptive, not a hypothesis test, and nothing about causation. An AUC of 0.5 is a coin flip; both ratios share the real numerator, so both can sit above it. Impellizzeri et al. (2021), Sports Medicine 51(3).
              </p>
            </details>
          </>
        ) : (
          <p className="text-sm" style={muted}>{audit.pooled.reason} Injuries logged on the athlete page feed this test.</p>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-left" style={muted}>
            <th className="py-2 font-medium">Athlete</th>
            <th className="py-2 font-medium text-right">Days with ratio</th>
            <th className="py-2 font-medium text-right">Self-audit ρ</th>
            <th className="py-2 font-medium text-right">Own 95th</th>
            <th className="py-2 font-medium text-right">1.5 flags</th>
            <th className="py-2 font-medium text-right">Injuries</th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {audit.athletes.map((a) => (
            <tr key={a.id}>
              <td className="py-2">
                <Link href={`/dashboard/athlete/${a.id}`} className="inline-flex items-center gap-2 hover:underline">
                  <Avatar name={a.name} hue={a.hue} size={24} />
                  <span>{a.name}</span>
                </Link>
              </td>
              <td className="py-2 text-right tabular-nums">{a.usableDays}</td>
              <td className="py-2 text-right tabular-nums">{a.rho !== null ? f2(a.rho) : <span style={muted}>—</span>}</td>
              <td className="py-2 text-right tabular-nums">{a.p95 !== null ? f2(a.p95) : <span style={muted}>—</span>}</td>
              <td className="py-2 text-right tabular-nums">{a.flaggedBy15 !== null ? pct(a.flaggedBy15) : <span style={muted}>—</span>}</td>
              <td className="py-2 text-right tabular-nums">{a.injuries}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs mt-3" style={muted}>A dash means fewer than 60 days with a ratio. &ldquo;1.5 flags&rdquo; is the share of days the universal cutoff would flag.</p>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--hairline)", background: "var(--surface-2)" }}>
      <div className="text-xs uppercase tracking-wide" style={muted}>{label}</div>
      <div className="text-2xl font-bold tabular-nums leading-none mt-1">{value}</div>
      <div className="text-xs mt-1" style={muted}>{sub}</div>
    </div>
  );
}

function Figure({ label, value, caption, strong }: { label: string; value: string; caption?: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide" style={muted}>{label}</div>
      <div className="text-2xl font-bold tabular-nums leading-none mt-1" style={strong ? { color: "var(--brand-text, var(--ink))" } : undefined}>{value}</div>
      {caption ? <div className="text-xs mt-1 truncate" style={muted}>{caption}</div> : null}
    </div>
  );
}
