/**
 * The team audit on the coach's overview: per-athlete score trust, and the
 * Impellizzeri experiment run on this team's own injury log. Describes, never
 * instructs; a missing result says why.
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
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold">Can the score be trusted on this team?</h2>
        <span className="text-xs" style={muted}>last {audit.days} days · {audit.athletes.length} athletes · {audit.pooled.events} logged injur{audit.pooled.events === 1 ? "y" : "ies"}</span>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Tile label="Median self-audit ρ" value={s.medianRho !== null ? f2(s.medianRho) : "—"} sub={s.medianRho !== null ? (s.medianRho >= 0.9 ? "the score is mostly weekly mileage" : s.medianRho >= 0.7 ? "mostly last week, baseline adds some" : "the 4-week baseline is doing real work") : `needs 60 days with a ratio · ${s.withPersonalZones} of ${audit.athletes.length} have it`} />
        <Tile label="1.5 is out of reach for" value={`${s.universalAboveOwn99th} of ${audit.athletes.length}`} sub="athletes whose own 99th percentile sits below the universal cutoff" />
        <Tile label="Own 95th below 1.3 for" value={`${s.own95thBelowCaution} of ${audit.athletes.length}`} sub="athletes the published caution line would never warn" />
      </div>

      <div className="rounded-xl border p-4 mb-4" style={{ borderColor: "var(--hairline)", background: "var(--surface-2)" }}>
        <div className="text-xs uppercase tracking-wide mb-1" style={muted}>The Impellizzeri test, on this roster</div>
        {c ? (
          <>
            <p className="text-sm">
              Across {c.n.toLocaleString()} athlete-days and {c.nEvents} injuries, the ratio the app shows separates injury days from the rest with an AUC of <b>{f2(c.real)}</b> ({f2(c.realCiLow)} to {f2(c.realCiHigh)}). A ratio whose 4-week denominator was shuffled into noise scores <b>{f2(c.null)}</b> ({f2(c.nullCiLow)} to {f2(c.nullCiHigh)}, {c.nNullDraws} draws).{" "}
              {c.realBeatsNull
                ? "The real denominator is carrying information on this team."
                : c.realOutsideNull
                  ? "The real denominator is costing signal that a random one did not: the paper\u2019s result, reproduced here."
                  : "The real ratio sits inside the noise interval: the chronic denominator added nothing on this team, which is the paper\u2019s result, reproduced here."}
            </p>
            <p className="text-xs mt-2" style={muted}>Descriptive, not a hypothesis test, and nothing about causation. An AUC of 0.5 is a coin flip; both ratios share the real numerator, so both can sit above it.</p>
          </>
        ) : (
          <p className="text-sm" style={muted}>{audit.pooled.reason} Log injuries as they happen (the athlete page has the form) and this panel will run the test on its own.</p>
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
      <p className="text-xs mt-3" style={muted}>
        ρ is how closely each athlete&rsquo;s score tracks their last 7 days alone (Impellizzeri et al. 2021); a dash means fewer than 60 days with a ratio. &ldquo;1.5 flags&rdquo; is the share of their days the universal cutoff would flag.
      </p>
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
