"use client";

import { useMemo, useState } from "react";
import { miNum } from "@/lib/units";

export type CalendarDay = { date: string; load: number; km: number };

/**
 * Month-by-month training intensity heatmap with prev/next arrows.
 * Sequential single-hue ramp (blue): darker/dimmer = easier day,
 * brighter = harder day, relative to the athlete's own 95th percentile.
 */

/*
 * low → high intensity (heat ramp — hotter = harder), as tokens.
 *
 * The literal ramp was built for a cream page: its low end (#fcd9c2) and the
 * rest-day tile (#f1ece2) are both near-white, so on a dark ground a year of
 * mostly-easy training rendered as a wall of bright tiles — the calendar read
 * inverted, with rest days shouting and hard days receding.
 *
 * The dark ramp keeps the same ordering and the same hue, but runs the
 * lightness the other way so "more" is still "hotter and brighter".
 */
const RAMP = [
  "var(--heat-1)",
  "var(--heat-2)",
  "var(--heat-3)",
  "var(--heat-4)",
  "var(--heat-5)",
];
const REST = "var(--heat-rest)";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

function level(load: number, p95: number): number {
  if (load < 10) return -1; // rest
  const x = load / Math.max(p95, 1);
  if (x < 0.3) return 0;
  if (x < 0.55) return 1;
  if (x < 0.75) return 2;
  if (x < 0.95) return 3;
  return 4;
}

const LEVEL_LABEL = ["Recovery", "Easy", "Moderate", "Hard", "Max effort"];

export default function IntensityCalendar({ days }: { days: CalendarDay[] }) {
  const byDate = useMemo(() => {
    const m = new Map<string, CalendarDay>();
    for (const d of days) m.set(d.date, d);
    return m;
  }, [days]);

  const p95 = useMemo(() => {
    const loads = days.map((d) => d.load).filter((l) => l >= 10).sort((a, b) => a - b);
    if (!loads.length) return 100;
    return loads[Math.min(loads.length - 1, Math.floor(loads.length * 0.95))];
  }, [days]);

  const now = new Date();
  const [offset, setOffset] = useState(0); // months back from current
  const shown = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const year = shown.getFullYear();
  const month = shown.getMonth();

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const cells: ({ iso: string; day: number } | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      iso: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      day: d,
    });
  }

  const [hover, setHover] = useState<{ iso: string; day: number } | null>(null);
  const hoverData = hover ? byDate.get(hover.iso) : undefined;
  const hoverLevel = hoverData ? level(hoverData.load, p95) : -1;

  // month totals
  let monthKm = 0;
  let monthDays = 0;
  for (const c of cells) {
    if (!c) continue;
    const d = byDate.get(c.iso);
    if (d && d.load >= 10) {
      monthKm += d.km;
      monthDays++;
    }
  }

  const canGoBack = offset < 11;
  const canGoFwd = offset > 0;

  return (
    <div>
      {/* header with arrows */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => canGoBack && setOffset(offset + 1)}
          disabled={!canGoBack}
          aria-label="Previous month"
          className="w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-default hover:bg-black/5"
          style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
        >
          ←
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold">
            {MONTHS[month]} {year}
          </div>
          <div className="text-xs" style={{ color: "var(--ink-muted)" }}>
            {monthDays} training days · {miNum(monthKm, 0)} mi
          </div>
        </div>
        <button
          onClick={() => canGoFwd && setOffset(offset - 1)}
          disabled={!canGoFwd}
          aria-label="Next month"
          className="w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-default hover:bg-black/5"
          style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
        >
          →
        </button>
      </div>

      {/* weekday header */}
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {DOW.map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-medium uppercase"
            style={{ color: "var(--ink-muted)" }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* day cells */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c, i) => {
          if (!c) return <div key={`e${i}`} />;
          const data = byDate.get(c.iso);
          const lv = data ? level(data.load, p95) : -1;
          const future = c.iso > todayIso;
          const dark = lv >= 3;
          const scoreColor = future
            ? "var(--ink-muted)"
            : dark
              ? "rgba(255,255,255,0.98)"
              : lv >= 0
                ? "rgba(34,29,21,0.9)"
                : "var(--ink-muted)";
          // daily hardness score = the training load for that day
          const score = data && data.load >= 10 ? Math.round(data.load) : null;
          return (
            <div
              key={c.iso}
              onMouseEnter={() => setHover(c)}
              onMouseLeave={() => setHover(null)}
              className="relative aspect-square rounded-md flex items-center justify-center select-none"
              style={{
                background: future ? "transparent" : lv === -1 ? REST : RAMP[lv],
                border:
                  c.iso === todayIso
                    ? "1.5px solid var(--brand)"
                    : future
                      ? "1px dashed var(--hairline)"
                      : "1px solid transparent",
                cursor: future ? "default" : "pointer",
              }}
            >
              {/* day-of-month in the corner */}
              <span
                className="absolute top-0.5 left-1 text-[8px] font-medium leading-none"
                style={{ color: dark ? "rgba(255,255,255,0.65)" : "var(--ink-muted)" }}
              >
                {c.day}
              </span>
              {/* hardness score (training load) */}
              {future ? null : score !== null ? (
                <span className="text-[11px] font-bold tabular-nums leading-none" style={{ color: scoreColor }}>
                  {score}
                </span>
              ) : (
                <span className="text-[9px] leading-none" style={{ color: "var(--ink-muted)" }}>
                  ·
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* hover readout + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 min-h-6">
        <div className="text-xs" style={{ color: "var(--ink-2)" }}>
          {hover && !((hover.iso as string) > todayIso) ? (
            hoverData && hoverData.load >= 10 ? (
              <>
                <span className="font-medium" style={{ color: "var(--ink)" }}>
                  {new Date(hover.iso + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  :
                </span>{" "}
                {LEVEL_LABEL[hoverLevel]} · {miNum(hoverData.km).toFixed(1)} mi · load{" "}
                {Math.round(hoverData.load)}
              </>
            ) : (
              <>
                <span className="font-medium" style={{ color: "var(--ink)" }}>
                  {new Date(hover.iso + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  :
                </span>{" "}
                Rest day
              </>
            )
          ) : (
            <span style={{ color: "var(--ink-muted)" }}>Number on each day = training load (higher = harder)</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--ink-muted)" }}>
          <span>Rest</span>
          <span className="w-3.5 h-3.5 rounded-sm" style={{ background: REST }} />
          {RAMP.map((c) => (
            <span key={c} className="w-3.5 h-3.5 rounded-sm" style={{ background: c }} />
          ))}
          <span>Max</span>
        </div>
      </div>
    </div>
  );
}
