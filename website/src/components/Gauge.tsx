"use client";

import { useEffect, useRef, useState } from "react";

/**
 * RunGuard's signature instrument: a 270° open arc (speedometer geometry),
 * round caps, subtle same-hue glow, draw-in + synchronized count-up on mount.
 * Plays once — subsequent renders land instantly.
 */
export default function Gauge({
  value,
  max = 100,
  color,
  size = 68,
  stroke = 6,
  label,
  animate = true,
}: {
  value: number;
  max?: number;
  color: string;
  size?: number;
  stroke?: number;
  label?: string;
  animate?: boolean;
}) {
  const r = (size - stroke) / 2 - 1;
  const cx = size / 2;
  const arcFrac = 0.75; // 270°
  const C = 2 * Math.PI * r;
  const arcLen = C * arcFrac;
  const frac = Math.max(0, Math.min(1, value / max));

  const [animShown, setAnimShown] = useState(0);
  const [animNum, setAnimNum] = useState(0);
  const raf = useRef<number | null>(null);

  /**
   * Derived, not stored, when there is nothing to animate.
   *
   * The previous version kept `frac` in state and re-synced it from an effect,
   * which did two bad things: it wrote state synchronously inside the effect
   * body (a second render before paint, every mount), and it went stale if
   * `value` changed while `animate` was false, because the render path was
   * reading a copy instead of the prop. Reading the prop directly cannot drift.
   */
  const shown = animate ? animShown : frac;
  const displayNum = animate ? animNum : Math.round(value);

  useEffect(() => {
    if (!animate) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      // Deferred by a frame rather than set synchronously here: a setState in
      // the effect body forces a re-render before the browser paints, which is
      // the cascade the lint rule is warning about. One frame is invisible and
      // the value still lands immediately.
      const id = requestAnimationFrame(() => {
        setAnimShown(frac);
        setAnimNum(Math.round(value));
      });
      return () => cancelAnimationFrame(id);
    }

    const dur = 1000;
    const delay = 180;
    let t0: number | null = null;

    const tick = (t: number) => {
      if (t0 === null) {
        t0 = t;
        // Kick the arc on the first frame — the CSS transition on .gauge-arc
        // sweeps it from 0 to frac while the number counts alongside.
        setAnimShown(frac);
      }
      const x = Math.min(1, Math.max(0, (t - t0 - delay) / dur));
      const eased = 1 - Math.pow(1 - x, 4); // quart-out, lands with the arc
      setAnimNum(Math.round(value * eased));
      if (x < 1) raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, frac, animate]);

  // rotate so the 270° arc opens at the bottom
  const rotation = 90 + 45;

  return (
    <div
      className="relative inline-flex items-center justify-center select-none"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label ?? "score"} ${Math.round(value)} of ${max}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(${rotation} ${cx} ${cx})`}>
          {/* track */}
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke="rgba(34,29,21,0.10)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arcLen} ${C}`}
          />
          {/* value */}
          <circle
            className="gauge-arc"
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arcLen} ${C}`}
            strokeDashoffset={arcLen * (1 - shown)}
            style={{ filter: `drop-shadow(0 0 ${stroke}px ${color}40)` }}
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-bold tabular-nums leading-none"
          style={{ fontSize: size * 0.3, color: "var(--ink)" }}
        >
          {displayNum}
        </span>
        {label && (
          <span
            className="uppercase font-semibold leading-none mt-0.5"
            style={{ fontSize: Math.max(7, size * 0.09), letterSpacing: "0.08em", color: "var(--ink-muted)" }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
