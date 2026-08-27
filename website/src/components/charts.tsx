"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { InsufficientData, hasEnoughData } from "./EmptyState";
import { NOT_ENOUGH_ACWR_HISTORY } from "@/lib/risk";
import { miNum, KM_PER_MI } from "@/lib/units";

const INK_MUTED = "#94897b";
const GRID = "#ece6da";
const SURFACE = "#ffffff";
const SERIES_1 = "#2a78d6";
const BRAND = "#f59e0b";
const CRITICAL = "#dc2626";
const GOOD = "#16a34a";
const GLOW = (c: string) => ({ filter: `drop-shadow(0 0 5px ${c}55)` });

export type SeriesPoint = {
  date: string;
  load: number;
  km: number;
  acute: number;
  chronic: number;
  acwr: number | null;
};

function fmtDay(d: string): string {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TooltipBox({
  label,
  rows,
}: {
  label: string;
  rows: [string, string][];
}) {
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-xl"
      style={{ background: SURFACE, borderColor: GRID, color: "#55503f", boxShadow: "0 8px 24px -10px rgba(34,29,21,0.25)" }}
    >
      <div className="font-medium mb-1" style={{ color: "#221d15" }}>
        {label}
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <span>{k}</span>
          <span style={{ color: "#221d15" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * "1 day / 3 days / 7 days / 1 month / 6 months" — the range control every
 * daily `SeriesPoint[]` chart below shares. A native `<select>` rather than a
 * pill row: five options is one too many to keep legible as buttons at the
 * width these charts render at inside a Stats-tab grid cell.
 */
const RANGES = [
  { key: "1d", label: "1 day", days: 1 },
  { key: "3d", label: "3 days", days: 3 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "1m", label: "1 month", days: 30 },
  { key: "6m", label: "6 months", days: 183 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

/** Default window: dense enough to read as a trend, not so wide it's a smear. */
const DEFAULT_RANGE: RangeKey = "1m";

function rangeDays(key: RangeKey): number {
  return RANGES.find((r) => r.key === key)!.days;
}

function RangeSelect({ value, onChange }: { value: RangeKey; onChange: (k: RangeKey) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as RangeKey)}
      className="text-[11px] rounded-full border px-2 py-1 cursor-pointer"
      style={{ borderColor: GRID, color: INK_MUTED, background: SURFACE }}
      aria-label="Date range"
    >
      {RANGES.map((r) => (
        <option key={r.key} value={r.key}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Trailing `days` of a date-sorted `SeriesPoint[]`. One entry per calendar day
 * by construction (`dailySeries`), so slicing by count IS slicing by days —
 * no date arithmetic needed, and it degrades safely for an athlete with less
 * history than the window asks for (`slice(-n)` on a shorter array is just
 * the whole array, not an error).
 */
function sliceRange(data: SeriesPoint[], days: number): SeriesPoint[] {
  return data.slice(-days);
}

/** ACWR over time with the 0.8–1.3 sweet spot shaded and 1.5 danger line. */
export function AcwrChart({ data }: { data: SeriesPoint[] }) {
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const windowed = sliceRange(data, rangeDays(range));
  const pts = windowed.filter((d) => d.acwr !== null);
  return (
    <div>
      <div className="flex justify-end mb-1.5">
        <RangeSelect value={range} onChange={setRange} />
      </div>
      {!hasEnoughData(pts, 5) ? (
        <InsufficientData label={NOT_ENOUGH_ACWR_HISTORY} />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={pts} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDay}
              tick={{ fill: INK_MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#d8d0c0" }}
              minTickGap={40}
            />
            <YAxis
              domain={[0, 2.2]}
              ticks={[0.5, 0.8, 1.3, 1.5, 2]}
              tick={{ fill: INK_MUTED, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <ReferenceArea
              y1={0.8}
              y2={1.3}
              fill={GOOD}
              fillOpacity={0.08}
              stroke="none"
            />
            <ReferenceLine
              y={1.5}
              stroke={CRITICAL}
              strokeDasharray="5 4"
              strokeWidth={1.5}
            />
            <Tooltip
              cursor={{ stroke: INK_MUTED, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as SeriesPoint;
                return (
                  <TooltipBox
                    label={fmtDay(p.date)}
                    rows={[
                      ["Workload ratio", p.acwr?.toFixed(2) ?? "—"],
                      ["Day load", Math.round(p.load) + ""],
                    ]}
                  />
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="acwr"
              stroke={BRAND}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
              style={GLOW(BRAND)}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/** Daily training load bars + acute/chronic EWMA lines. */
export function LoadChart({ data }: { data: SeriesPoint[] }) {
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const windowed = sliceRange(data, rangeDays(range));
  return (
    <div>
      <div className="flex justify-end mb-1.5">
        <RangeSelect value={range} onChange={setRange} />
      </div>
      {!hasEnoughData(windowed, 5, (d) => d.load > 0) ? (
        <InsufficientData />
      ) : (
        <div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={windowed} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDay}
                tick={{ fill: INK_MUTED, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#d8d0c0" }}
                minTickGap={40}
              />
              <YAxis
                tick={{ fill: INK_MUTED, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(34,29,21,0.045)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as SeriesPoint;
                  return (
                    <TooltipBox
                      label={fmtDay(p.date)}
                      rows={[
                        ["Day load", Math.round(p.load) + ""],
                        ["Distance", miNum(p.km).toFixed(1) + " mi"],
                        ["Acute (7d avg)", Math.round(p.acute) + ""],
                        ["Chronic (28d avg)", Math.round(p.chronic) + ""],
                      ]}
                    />
                  );
                }}
              />
              <Bar
                dataKey="load"
                fill="rgba(34,29,21,0.30)"
                radius={[3, 3, 0, 0]}
                maxBarSize={6}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="acute"
                stroke={BRAND}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                style={GLOW(BRAND)}
              />
              <Line
                type="monotone"
                dataKey="chronic"
                stroke={SERIES_1}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                style={GLOW(SERIES_1)}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex gap-4 pl-2 pt-1 text-xs" style={{ color: "#55503f" }}>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 rounded" style={{ background: BRAND }} />
              Acute load (7d)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 rounded" style={{ background: SERIES_1 }} />
              Chronic load (28d)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-sm"
                style={{ background: "rgba(34,29,21,0.30)" }}
              />
              Daily load
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Weekly mileage bars. */
export function WeeklyKmChart({
  data,
}: {
  data: { week: string; km: number }[];
}) {
  if (!hasEnoughData(data, 3, (d) => d.km > 0)) return <InsufficientData />;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="week"
          tick={{ fill: INK_MUTED, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#d8d0c0" }}
        />
        <YAxis tick={{ fill: INK_MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "rgba(34,29,21,0.045)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { week: string; km: number };
            return <TooltipBox label={p.week} rows={[["Distance", miNum(p.km).toFixed(1) + " mi"]]} />;
          }}
        />
        <defs>
          <linearGradient id="kmBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_1} stopOpacity={1} />
            <stop offset="100%" stopColor={SERIES_1} stopOpacity={0.45} />
          </linearGradient>
        </defs>
        <Bar
          dataKey="km"
          fill="url(#kmBar)"
          radius={[4, 4, 0, 0]}
          maxBarSize={26}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Weekly average pace — reversed axis so up = faster. */
export function PaceChart({ data }: { data: { week: string; pace: number | null }[] }) {
  const fmt = (v: number) =>
    `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`;
  const pts = data.filter((d) => d.pace !== null);
  if (!hasEnoughData(pts, 3)) return <InsufficientData />;
  const paces = pts.map((d) => d.pace as number);
  const min = Math.min(...paces);
  const max = Math.max(...paces);
  const pad = Math.max(8, (max - min) * 0.25);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={pts} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis
          dataKey="week"
          tick={{ fill: INK_MUTED, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#d8d0c0" }}
          minTickGap={30}
        />
        <YAxis
          reversed
          domain={[min - pad, max + pad]}
          tickFormatter={fmt}
          tick={{ fill: INK_MUTED, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip
          cursor={{ stroke: INK_MUTED, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { week: string; pace: number };
            return <TooltipBox label={p.week} rows={[["Avg pace", fmt(p.pace * KM_PER_MI) + "/mi"]]} />;
          }}
        />
        <Line
          type="monotone"
          dataKey="pace"
          stroke={SERIES_1}
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: SERIES_1 }}
          activeDot={{ r: 5, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Fitness score trend line (season). */
export function FitnessChart({ data }: { data: { week: string; score: number }[] }) {
  if (!hasEnoughData(data, 3)) return <InsufficientData />;
  return (
    <ResponsiveContainer width="100%" height={190}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis dataKey="week" tick={{ fill: INK_MUTED, fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#d8d0c0" }} minTickGap={30} />
        <YAxis domain={[0, 100]} tick={{ fill: INK_MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ stroke: INK_MUTED, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { week: string; score: number };
            return <TooltipBox label={p.week} rows={[["Fitness score", String(p.score)]]} />;
          }}
        />
        <Line type="monotone" dataKey="score" stroke={GOOD} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} style={GLOW(GOOD)} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Sleep hours over 30 days with the 8h target line. */
export function SleepChart({ data }: { data: { date: string; hours: number | null }[] }) {
  if (!hasEnoughData(data, 5, (d) => d.hours !== null)) return <InsufficientData />;
  // A night with no reading is NOT a night of no sleep. Passing `null` straight
  // through leaves that day's bar unrendered — a gap in the row — rather than
  // coercing it to 0 and drawing a floor-height bar that reads as "slept ~none".
  return (
    <ResponsiveContainer width="100%" height={190}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: INK_MUTED, fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#d8d0c0" }} minTickGap={40} />
        <YAxis domain={[0, 10]} tick={{ fill: INK_MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
        <ReferenceLine y={8} stroke={GOOD} strokeDasharray="5 4" strokeWidth={1.5} />
        <Tooltip
          cursor={{ fill: "rgba(34,29,21,0.045)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { date: string; hours: number | null };
            return <TooltipBox label={fmtDay(p.date)} rows={[["Sleep", p.hours != null ? p.hours.toFixed(1) + " h" : "no data"]]} />;
          }}
        />
        <Bar dataKey="hours" fill={SERIES_1} radius={[3, 3, 0, 0]} maxBarSize={12} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** PR progression per event — stepped line down over time. */
export function PRChart({ data, event }: { data: { date: string; timeS: number }[]; event: string }) {
  const fmt = (v: number) => {
    const m = Math.floor(v / 60);
    const s = Math.round(v % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };
  if (!hasEnoughData(data, 1)) return <InsufficientData height={100} label="No PRs logged yet for this event." />;
  const pts = data.map((d) => ({ ...d, label: fmtDay(d.date) }));
  const times = pts.map((p) => p.timeS);
  const pad = Math.max(5, (Math.max(...times) - Math.min(...times)) * 0.3);
  return (
    <ResponsiveContainer width="100%" height={150}>
      <ComposedChart data={pts} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: INK_MUTED, fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#d8d0c0" }} />
        <YAxis reversed domain={[Math.min(...times) - pad, Math.max(...times) + pad]} tickFormatter={fmt} tick={{ fill: INK_MUTED, fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          cursor={{ stroke: INK_MUTED, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { label: string; timeS: number };
            return <TooltipBox label={`${event} · ${p.label}`} rows={[["PR", fmt(p.timeS)]]} />;
          }}
        />
        <Line type="stepAfter" dataKey="timeS" stroke={BRAND} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: BRAND }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Energy & motivation trend from check-ins. */
export function MentalChart({ data }: { data: { date: string; energy: number | null; motivation: number | null }[] }) {
  if (!hasEnoughData(data, 5, (d) => d.energy != null || d.motivation != null)) return <InsufficientData />;
  return (
    <div>
      <ResponsiveContainer width="100%" height={170}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: INK_MUTED, fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#d8d0c0" }} minTickGap={40} />
          <YAxis domain={[0, 10]} tick={{ fill: INK_MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ stroke: INK_MUTED, strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { date: string; energy: number | null; motivation: number | null };
              return (
                <TooltipBox
                  label={fmtDay(p.date)}
                  rows={[
                    ["Energy", p.energy != null ? String(p.energy) : "—"],
                    ["Motivation", p.motivation != null ? String(p.motivation) : "—"],
                  ]}
                />
              );
            }}
          />
          {/* No `connectNulls`: a day with no check-in is not a data point, and a
              line drawn straight across it invents a reading for every day in the
              gap. The line breaks instead. Dots are on so a single check-in with
              no neighbours still renders — without them an isolated day would
              have neither a segment nor a mark and would vanish entirely. */}
          <Line type="monotone" dataKey="energy" stroke={BRAND} strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: BRAND }} isAnimationActive={false} />
          <Line type="monotone" dataKey="motivation" stroke={SERIES_1} strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: SERIES_1 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex gap-4 pl-2 pt-1 text-xs" style={{ color: "#55503f" }}>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 rounded" style={{ background: BRAND }} />Energy</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 rounded" style={{ background: SERIES_1 }} />Motivation</span>
      </div>
    </div>
  );
}

/** Tiny sparkline for the roster table. */
export function LoadSpark({ data }: { data: SeriesPoint[] }) {
  const recent = data.slice(-28);
  return (
    <ResponsiveContainer width="100%" height={34}>
      <ComposedChart data={recent} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <Bar
          dataKey="load"
          fill="rgba(34,29,21,0.32)"
          radius={[1, 1, 0, 0]}
          maxBarSize={4}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}


/* ---------------- single-activity detail ---------------- */

const fmtClock = (t: number) => {
  const m = Math.floor(t / 60);
  const sec = Math.round(t % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

/**
 * Heart rate across one run. The y-domain is padded off the true min/max rather
 * than anchored at zero: nobody's heart rate starts at 0, and a 0-based axis
 * squashes the whole trace into the top third where the shape is unreadable.
 */
export function ActivityHrChart({ data }: { data: { t_s: number; bpm: number }[] }) {
  if (data.length < 4) return <InsufficientData />;
  const lo = Math.min(...data.map((d) => d.bpm));
  const hi = Math.max(...data.map((d) => d.bpm));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis dataKey="t_s" tickFormatter={fmtClock} tick={{ fill: INK_MUTED, fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#d8d0c0" }} minTickGap={44} />
        <YAxis domain={[Math.max(0, Math.floor(lo - 6)), Math.ceil(hi + 6)]} tick={{ fill: INK_MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ stroke: INK_MUTED, strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { t_s: number; bpm: number };
            return <TooltipBox label={fmtClock(p.t_s) + " in"} rows={[["Heart rate", `${p.bpm} bpm`]]} />;
          }}
        />
        <Line type="monotone" dataKey="bpm" stroke={CRITICAL} strokeWidth={2} dot={false} isAnimationActive={false} style={GLOW(CRITICAL)} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Elevation across one run, in feet. */
export function ActivityElevChart({ data }: { data: { t_s: number; ft: number }[] }) {
  if (data.length < 4) return <InsufficientData />;
  const lo = Math.min(...data.map((d) => d.ft));
  const hi = Math.max(...data.map((d) => d.ft));
  const pad = Math.max(10, (hi - lo) * 0.2);
  return (
    <ResponsiveContainer width="100%" height={150}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis dataKey="t_s" tickFormatter={fmtClock} tick={{ fill: INK_MUTED, fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#d8d0c0" }} minTickGap={44} />
        <YAxis domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]} tick={{ fill: INK_MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ stroke: INK_MUTED, strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { t_s: number; ft: number };
            return <TooltipBox label={fmtClock(p.t_s) + " in"} rows={[["Elevation", `${Math.round(p.ft)} ft`]]} />;
          }}
        />
        <Line type="monotone" dataKey="ft" stroke={GOOD} strokeWidth={2} dot={false} isAnimationActive={false} style={GLOW(GOOD)} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
