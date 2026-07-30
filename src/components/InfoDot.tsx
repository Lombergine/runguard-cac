"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ *
 *  InfoDot — small circled "i" next to a stat label. Tap (or hover on
 *  a mouse) to read what the number actually means and where it comes
 *  from. Closes on outside tap or Escape.
 * ------------------------------------------------------------------ */

export default function InfoDot({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span ref={wrap} className="relative inline-flex align-middle ml-1.5">
      <button
        type="button"
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="flex items-center justify-center rounded-full border text-[9px] font-bold leading-none cursor-help"
        style={{
          width: 14,
          height: 14,
          borderColor: "var(--hairline)",
          color: "var(--ink-muted)",
          background: "var(--surface)",
        }}
      >
        i
      </button>

      {open && (
        <span
          role="tooltip"
          className="absolute z-30 left-1/2 -translate-x-1/2 top-5 w-56 rounded-xl border p-2.5 text-xs font-normal normal-case tracking-normal leading-relaxed shadow-lg"
          style={{
            borderColor: "var(--hairline)",
            background: "var(--surface)",
            color: "var(--ink-2)",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
