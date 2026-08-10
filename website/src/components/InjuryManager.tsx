"use client";

import { localDay } from "@/lib/day";
import { useState } from "react";
import { useRouter } from "next/navigation";

/* ------------------------------------------------------------------ *
 *  InjuryManager — coach-side injury log for one athlete.
 *  Injuries are recorded by a person, never computed. Only unresolved
 *  ones light up the body scan; resolved ones stay as history for the
 *  risk engine, badges, and the AI coach.
 * ------------------------------------------------------------------ */

export type InjuryItem = {
  id: number;
  date: string;
  body_part: string;
  note: string | null;
  resolved_at: string | null;
};

/* regions match AthleteModel's anatomy map so the body scan lights up correctly */
const PARTS: { k: string; label: string; lateral: boolean }[] = [
  { k: "shin", label: "Shin", lateral: true },
  { k: "calf", label: "Calf", lateral: true },
  { k: "achilles", label: "Achilles", lateral: true },
  { k: "heel", label: "Heel / plantar", lateral: true },
  { k: "foot", label: "Foot", lateral: true },
  { k: "knee", label: "Knee", lateral: true },
  { k: "hamstring", label: "Hamstring", lateral: true },
  { k: "quad", label: "Quad", lateral: true },
  { k: "hip", label: "Hip / IT band", lateral: true },
  { k: "groin", label: "Groin", lateral: false },
  { k: "lower back", label: "Lower back", lateral: false },
  { k: "shoulder", label: "Shoulder", lateral: true },
];

const fmt = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const today = () => localDay();

export default function InjuryManager({
  athleteId,
  injuries,
}: {
  athleteId: number;
  injuries: InjuryItem[];
}) {
  const [tab, setTab] = useState<"current" | "previous">("current");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [part, setPart] = useState("");
  const [side, setSide] = useState<"left" | "right" | "both">("left");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const router = useRouter();

  const region = PARTS.find((p) => p.k === part) ?? null;
  // a lateral part needs a side, or the scan lights up both legs
  const bodyPart = region ? (region.lateral ? `${part} (${side})` : part) : "";

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!bodyPart) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/injury", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteId, bodyPart, date, note: note.trim() || null }),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "Couldn't save that.");
      setBusy(false);
      return;
    }
    setPart("");
    setNote("");
    setDate(today());
    setAdding(false);
    setBusy(false);
    router.refresh();
  }

  async function setResolved(id: number, resolved: boolean) {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/injury", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteId, id, resolved }),
    });
    if (!res.ok) setErr((await res.json().catch(() => ({}))).error || "Couldn't update that.");
    setBusy(false);
    router.refresh();
  }

  const active = injuries.filter((i) => !i.resolved_at);
  const previous = injuries.filter((i) => i.resolved_at);
  const shown = tab === "current" ? active : previous;

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-full border p-1 text-sm" style={{ borderColor: "var(--hairline)" }}>
        {([
          ["current", "Current injuries", active.length],
          ["previous", "Previous injuries", previous.length],
        ] as const).map(([k, label, count]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className="rounded-full px-3.5 py-1 font-medium"
            style={k === tab ? { background: "var(--ember)", color: "#000" } : { color: "var(--ink-2)" }}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
        {tab === "current"
          ? active.length
            ? `${active.length} active — showing on the body scan`
            : "Nothing active — the body scan is clear"
          : "Healed — kept as history for the risk engine, not shown on the body scan"}
      </p>

      <div className="space-y-2.5">
        {shown.map((i) => {
          const healed = Boolean(i.resolved_at);
          return (
            <div key={i.id} className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <div className="flex-1 min-w-48 text-sm" style={{ color: "var(--ink-2)" }}>
                <span className="font-medium" style={{ color: healed ? "var(--ink-muted)" : "var(--ink)" }}>
                  {i.body_part}
                </span>
                {!healed && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded ml-2 align-middle"
                    style={{ background: "color-mix(in oklab, #ef4444 18%, transparent)", color: "#ef4444" }}
                  >
                    active
                  </span>
                )}
                <span className="text-xs ml-2" style={{ color: "var(--ink-muted)" }}>
                  {fmt(i.date)}
                  {healed && ` → healed ${fmt(i.resolved_at!)}`}
                </span>
                {i.note && (
                  <div className="text-xs mt-0.5" style={{ color: "var(--ink-muted)" }}>
                    {i.note}
                  </div>
                )}
              </div>
              <button
                onClick={() => setResolved(i.id, !healed)}
                disabled={busy}
                className="text-xs rounded-full border px-3 py-1 font-medium disabled:opacity-50"
                style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
              >
                {healed ? "Reopen" : "Mark healed"}
              </button>
            </div>
          );
        })}
        {shown.length === 0 && (
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
            {tab === "current" ? "No active injuries." : "No previous injuries on record."}
          </p>
        )}
      </div>

      {err && (
        <p className="text-xs" style={{ color: "var(--status-critical)" }}>
          {err}
        </p>
      )}

      {adding ? (
        <form onSubmit={add} className="space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--hairline)" }}>
          <div className="flex flex-wrap gap-2">
            <select
              value={part}
              onChange={(e) => setPart(e.target.value)}
              required
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--hairline)", background: "var(--surface)", color: "var(--ink)" }}
            >
              <option value="">Body part…</option>
              {PARTS.map((p) => (
                <option key={p.k} value={p.k}>
                  {p.label}
                </option>
              ))}
            </select>

            {region?.lateral && (
              <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: "var(--hairline)" }}>
                {(["left", "right", "both"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSide(s)}
                    className="rounded-md px-2.5 py-1 text-xs font-medium capitalize"
                    style={s === side ? { background: "var(--ember)", color: "#000" } : { color: "var(--ink-2)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--hairline)", background: "var(--surface)", color: "var(--ink)" }}
            />
          </div>

          <input
            type="text"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Diagnosis or note (optional)"
            className="w-full rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--hairline)", background: "var(--surface)", color: "var(--ink)" }}
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !bodyPart}
              className="rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--ember)", color: "#000" }}
            >
              Log injury
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setErr(null);
              }}
              className="rounded-full px-4 py-1.5 text-sm font-medium"
              style={{ color: "var(--ink-2)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        /* a new injury is always active, so it only belongs on the current tab */
        tab === "current" && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-full border px-4 py-1.5 text-sm font-medium"
            style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
          >
            + Log an injury
          </button>
        )
      )}
    </div>
  );
}
