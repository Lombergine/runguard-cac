"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type PlanCell = {
  date: string;
  type: string | null;
  distanceMi: number | null;
  targetPace: string | null;
  details: string | null;
  why: string | null;
  updatedBy: string | null;
};

/**
 * Four weeks of the team's training calendar, click-to-edit.
 *
 * The editor is a panel below the grid rather than a modal over it. A coach
 * writing Thursday wants to see what Tuesday and Wednesday say while they do
 * it — that is the whole reason for planning on a calendar instead of in a
 * form — and a dialog covers exactly the days they are planning against.
 *
 * `saving` is per-day rather than global so a slow save cannot make the whole
 * grid look broken, and the editor keeps its own draft state until save, so a
 * mis-click on another day cannot silently discard typing.
 */
export default function PlanCalendar({
  days,
  weekOffset,
  today,
}: {
  days: PlanCell[];
  weekOffset: number;
  today: string;
}) {
  const router = useRouter();
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanCell | null>(null);
  /*
   * The distance box keeps a STRING, not a number.
   *
   * Holding it as `Number(e.target.value)` meant every intermediate keystroke a
   * coach types on the way to "5.5" — "5." — became NaN, JSON.stringify sent
   * that as null, and the route read null as "no distance given". Typing a
   * decimal distance and saving mid-keystroke silently cleared the distance
   * while reporting success. The value is parsed once, at submit.
   */
  const [distanceInput, setDistanceInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const weeks: PlanCell[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  function open(cell: PlanCell) {
    setOpenDate(cell.date);
    setDraft({ ...cell });
    setDistanceInput(cell.distanceMi !== null ? String(cell.distanceMi) : "");
    setMsg("");
  }

  function close() {
    setOpenDate(null);
    setDraft(null);
    setDistanceInput("");
    setMsg("");
  }

  async function save() {
    if (!draft) return;
    if (!draft.type || !draft.type.trim()) {
      setMsg("Give the session a name, “Easy run”, “6×800m”, “Rest”.");
      return;
    }
    const typed = distanceInput.trim();
    if (typed && !/^\d{1,2}(\.\d{1,2})?$/.test(typed)) {
      setMsg("Distance should be a number of miles, 5, or 5.5. Leave it blank for a rest day.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/team-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: draft.date,
        type: draft.type,
        distanceMi: typed,
        targetPace: draft.targetPace ?? "",
        details: draft.details ?? "",
        why: draft.why ?? "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      close();
      router.refresh();
    } else {
      // The route names the field it rejected; replacing that with a generic
      // failure would leave the coach with nothing to correct.
      setMsg(data.error || "Couldn't save.");
    }
  }

  async function clearDay() {
    if (!draft) return;
    setBusy(true);
    const res = await fetch("/api/team-plan", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: draft.date }),
    });
    setBusy(false);
    if (res.ok) {
      close();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error || "Couldn't clear that day.");
    }
  }

  return (
    <div className="space-y-4">
      {/* week navigation */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/dashboard/plan?week=${weekOffset - 4}`}
          scroll={false}
          className="text-sm rounded-full border px-4 py-2 hover:opacity-70"
          style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
        >
          ← Earlier
        </Link>
        <span className="text-sm font-medium" style={{ color: "var(--ink-muted)" }}>
          {label(days[0].date)} – {label(days[days.length - 1].date)}
          {weekOffset !== 0 && (
            <Link href="/dashboard/plan" scroll={false} className="ml-3 underline hover:opacity-70" style={{ color: "var(--brand-strong)" }}>
              back to this week
            </Link>
          )}
        </span>
        <Link
          href={`/dashboard/plan?week=${weekOffset + 4}`}
          scroll={false}
          className="text-sm rounded-full border px-4 py-2 hover:opacity-70"
          style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
        >
          Later →
        </Link>
      </div>

      {/* the grid */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
      >
        <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--hairline)" }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center micro-label"
              style={{ color: "var(--ink-muted)" }}
            >
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((cell) => {
              const isToday = cell.date === today;
              const isOpen = cell.date === openDate;
              const written = Boolean(cell.type);
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => open(cell)}
                  aria-label={`${label(cell.date)}, ${written ? cell.type : "no session written"}`}
                  className="text-left border-t border-r p-2 min-h-24 transition-colors hover:bg-black/[0.03] cursor-pointer"
                  style={{
                    borderColor: "var(--hairline)",
                    background: isOpen
                      ? "color-mix(in oklab, var(--brand) 10%, var(--surface))"
                      : written
                        ? "color-mix(in oklab, var(--brand) 4%, var(--surface))"
                        : "var(--surface)",
                    boxShadow: isToday ? "inset 0 3px 0 var(--brand)" : undefined,
                  }}
                >
                  <div
                    className="text-xs tabular-nums font-semibold"
                    style={{ color: isToday ? "var(--brand-strong)" : "var(--ink-muted)" }}
                  >
                    {Number(cell.date.slice(8, 10))}
                  </div>
                  {written ? (
                    <>
                      <div className="text-xs font-semibold mt-1 leading-snug" style={{ color: "var(--ink)" }}>
                        {cell.type}
                      </div>
                      {(cell.distanceMi !== null || cell.targetPace) && (
                        <div className="text-[11px] mt-0.5 tabular-nums" style={{ color: "var(--ink-2)" }}>
                          {[cell.distanceMi !== null ? `${cell.distanceMi} mi` : null, cell.targetPace]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-[11px] mt-1" style={{ color: "var(--ink-muted)" }}>
                      RunGuard picks
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* editor */}
      {draft && (
        <div
          className="rounded-2xl border p-5 space-y-3 enter"
          style={{ borderColor: "var(--brand)", background: "var(--surface)" }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{label(draft.date, true)}</h2>
            {draft.updatedBy && (
              <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
                last written by {draft.updatedBy}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {["Easy run", "Long run", "Recovery run", "Tempo", "Intervals", "Hills", "Race", "Rest"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDraft({ ...draft, type: preset })}
                className="text-xs rounded-full border px-3 py-1.5 cursor-pointer"
                style={{
                  borderColor: draft.type === preset ? "var(--brand)" : "var(--hairline)",
                  color: draft.type === preset ? "var(--brand-strong)" : "var(--ink-muted)",
                }}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-3 gap-2">
            <input
              value={draft.type ?? ""}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
              placeholder="Session: e.g. 6×800m"
              className="sm:col-span-1 rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--hairline)" }}
            />
            <input
              value={distanceInput}
              onChange={(e) => setDistanceInput(e.target.value)}
              inputMode="decimal"
              placeholder="Distance (mi), blank for rest"
              className="rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--hairline)" }}
            />
            <input
              value={draft.targetPace ?? ""}
              onChange={(e) => setDraft({ ...draft, targetPace: e.target.value })}
              placeholder="Target pace: e.g. 7:30/mi"
              className="rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--hairline)" }}
            />
          </div>

          <textarea
            value={draft.details ?? ""}
            onChange={(e) => setDraft({ ...draft, details: e.target.value })}
            rows={2}
            placeholder="What to actually do. Reps, recovery, where you're meeting"
            className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--hairline)" }}
          />
          <textarea
            value={draft.why ?? ""}
            onChange={(e) => setDraft({ ...draft, why: e.target.value })}
            rows={2}
            placeholder="Why they're doing it: athletes read this, and it's the part that makes them buy in"
            className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--hairline)" }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-black cursor-pointer disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              {busy ? "Saving…" : "Save to the team"}
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-xl border px-4 py-2 text-sm cursor-pointer"
              style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
            >
              Cancel
            </button>
            {draft.type && (
              <button
                type="button"
                onClick={clearDay}
                disabled={busy}
                className="rounded-xl border px-4 py-2 text-sm cursor-pointer disabled:opacity-50 ml-auto"
                style={{ borderColor: "var(--hairline)", color: "var(--ink-muted)" }}
                title="Hand this day back to RunGuard's per-athlete suggestion"
              >
                Clear day
              </button>
            )}
            {msg && (
              <span
                className="text-xs"
                style={{ color: msg.includes("✓") ? "var(--status-good)" : "var(--status-serious)" }}
              >
                {msg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** "Mon 8 Sep", or the long form for the editor heading. */
function label(iso: string, long = false): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US",
    long
      ? { weekday: "long", month: "long", day: "numeric" }
      : { month: "short", day: "numeric" }
  );
}
