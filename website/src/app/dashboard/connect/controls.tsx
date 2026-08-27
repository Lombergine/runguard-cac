"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** How long a fallback plaintext reveal stays on screen before hiding itself. */
const REVEAL_TIMEOUT_MS = 20_000;

/**
 * The athlete's app token — copied to the phone, never displayed if it can be
 * helped.
 *
 * This is a Bearer credential for a minor's health data (see `DEPLOY.md` →
 * *Credentials*), and getting it onto the athlete's phone is the one thing a
 * coach genuinely needs this row for — pairing has no other path today (see
 * `app/pair.tsx`). But "needs to reach the phone" and "needs to sit rendered on
 * a laptop screen at a meet" are different requirements, so `copy()` writes
 * straight to the clipboard and the raw token is never put in the DOM at all
 * unless that fails. The old version had a standalone "reveal" toggle that
 * left the plaintext on screen indefinitely until someone remembered to click
 * "Hide"; this version only ever shows it as a last resort (clipboard access is
 * permission-gated and throws on non-HTTPS origins), and even then it hides
 * itself after `REVEAL_TIMEOUT_MS` rather than waiting to be dismissed.
 *
 * Rotating this token is deliberately NOT offered here: `POST
 * /api/athlete/rotate-token` refuses any caller on the coach path by design —
 * a coach able to silently reissue an athlete's credential could grant
 * themself ongoing access to a minor's data under that athlete's identity,
 * which is worse than the exposure this component is trying to reduce. Only
 * the athlete, from their own session, can rotate it.
 */
export function TokenButton({ deviceToken }: { deviceToken: string | null }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!deviceToken) {
    return (
      <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
        No token yet
      </span>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(deviceToken!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is permission-gated and throws on http:// origins. This is
      // the only path that ever renders the raw token — and even here it
      // hides itself rather than waiting for someone to remember to.
      setRevealed(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setRevealed(false), REVEAL_TIMEOUT_MS);
    }
  }

  return (
    <span className="inline-flex items-center gap-2 justify-end">
      {revealed && (
        <code
          className="text-[11px] px-2 py-1 rounded-lg border select-all"
          style={{ borderColor: "var(--hairline)", background: "var(--page)" }}
          title="Copy failed, so this is shown as a fallback — it hides itself shortly"
        >
          {deviceToken}
        </code>
      )}
      <button
        onClick={copy}
        className="text-xs rounded-full border px-3 py-1.5 cursor-pointer"
        style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
        title="Copies the token this athlete pairs the iPhone app with — never shown on screen unless copying fails"
      >
        {copied ? "Copied" : "Copy app token"}
      </button>
    </span>
  );
}

export function AppleImportForm({
  athletes,
}: {
  athletes: { id: number; name: string }[];
}) {
  const [athleteId, setAthleteId] = useState(athletes[0]?.id ?? 0);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setState("busy");
    setMsg("");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("athleteId", String(athleteId));
    if (startDate) fd.set("startDate", startDate);
    if (endDate) fd.set("endDate", endDate);
    const res = await fetch("/api/import/apple", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setState("done");
      setMsg(`Found ${data.found} workouts, imported ${data.imported} new.`);
      router.refresh();
    } else {
      setState("error");
      setMsg(data.error || "Import failed.");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
      <select
        value={athleteId}
        onChange={(e) => setAthleteId(Number(e.target.value))}
        className="rounded-xl border px-3 py-2 text-sm outline-none"
        style={{ borderColor: "var(--hairline)", background: "var(--page)" }}
      >
        {athletes.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <input
        type="file"
        accept=".zip,.xml"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-sm file:mr-3 file:rounded-full file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-medium file:bg-black/10 file:text-black file:cursor-pointer"
        style={{ color: "var(--ink-muted)" }}
      />
      <span className="inline-flex items-center gap-1.5">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          title="Only import from this date (optional — defaults to the whole export)"
          className="text-xs rounded-lg border px-2 py-1.5"
          style={{ borderColor: "var(--hairline)", background: "var(--page)" }}
        />
        <span className="text-xs" style={{ color: "var(--ink-muted)" }}>to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          title="Only import up to this date (optional)"
          className="text-xs rounded-lg border px-2 py-1.5"
          style={{ borderColor: "var(--hairline)", background: "var(--page)" }}
        />
      </span>
      <button
        disabled={!file || state === "busy"}
        className="rounded-xl px-4 py-2 text-sm font-semibold text-black disabled:opacity-50 cursor-pointer"
        style={{ background: "var(--brand)" }}
      >
        {state === "busy" ? "Parsing…" : "Import"}
      </button>
      {msg && (
        <span
          className="text-xs"
          style={{
            color: state === "error" ? "var(--status-serious)" : "var(--status-good)",
          }}
        >
          {msg}
        </span>
      )}
    </form>
  );
}
