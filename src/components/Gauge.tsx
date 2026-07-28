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

  const [shown, setShown] = useState(animate ? 0 : frac);
  const [displayNum, setDisplayNum] = useState(animate ? 0 : Math.round(value));
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!animate) {
      setShown(frac);
      setDisplayNum(Math.round(value));
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(frac);
      setDisplayNum(Math.round(value));
      return;
    }
    const t0 = performance.now();
    const dur = 1000;
    const delay = 180;
    setShown(frac); // CSS transition handles the arc sweep
    const tick = (t: number) => {
      const x = Math.min(1, Math.max(0, (t - t0 - delay) / dur));
      const eased = 1 - Math.pow(1 - x, 4); // quart-out, lands with the arc
      setDisplayNum(Math.round(value * eased));
      if (x < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
