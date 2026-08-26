"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { RANGES, DEFAULT_RANGE } from "@/lib/range";

/**
 * Time-window selector for the coach dashboard.
 *
 * The window lives in the URL rather than in component state so the page stays
 * a server component — the numbers are recomputed on the server for the chosen
 * range instead of every athlete's full history being shipped to the browser to
 * be re-filtered there. It also means a coach can bookmark or send "the last
 * month" view and have it open the same way.
 *
 * `useTransition` keeps the old numbers on screen, dimmed, while the new ones
 * are fetched. Without it the whole table blanks on every change, which reads
 * as a page break rather than a filter.
 */
export default function RangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const current = params.get("range") ?? DEFAULT_RANGE;

  function pick(key: string) {
    const next = new URLSearchParams(params.toString());
    if (key === DEFAULT_RANGE) next.delete("range");
    else next.set("range", key);
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <label className="inline-flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
        Window
      </span>
      <select
        value={current}
        onChange={(e) => pick(e.target.value)}
        aria-label="Time window for the numbers on this page"
        className="rounded-xl border px-3 py-2 text-sm font-medium outline-none cursor-pointer"
        style={{
          borderColor: "var(--hairline)",
          background: "var(--surface)",
          color: "var(--ink)",
          opacity: pending ? 0.55 : 1,
        }}
      >
        {RANGES.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}
