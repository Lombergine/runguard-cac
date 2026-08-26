"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The athlete's app token, revealed on demand.
 *
 * This is a Bearer credential, so it stays behind a click rather than sitting
 * in the page for anyone reading over a coach's shoulder at a meet. The button
 * used to share this row with Strava connect/sync controls; those are gone
 * along with the OAuth flow, and what remains is the one thing a coach needs
 * from this table.
 */
export function TokenButton({ deviceToken }: { deviceToken: string | null }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

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
      // Clipboard is permission-gated and throws on http:// origins. The token
      // is already on screen at this point, so failing here costs nothing.
      setShown(true);
    }
  }

  return (
    <span className="inline-flex items-center gap-2 justify-end">
      {shown && (
        <code
          className="text-[11px] px-2 py-1 rounded-lg border select-all"
          style={{ borderColor: "var(--hairline)", background: "var(--page)" }}
        >
          {deviceToken}
        </code>
      )}
      <button
        onClick={() => setShown((v) => !v)}
        className="text-xs rounded-full border px-3 py-1.5 cursor-pointer"
        style={{ borderColor: "var(--hairline)", color: "var(--ink-muted)" }}
        title="The token this athlete signs into the iPhone app with"
      >
        {shown ? "Hide" : "App token"}
      </button>
      <button
        onClick={copy}
        className="text-xs rounded-full border px-3 py-1.5 cursor-pointer"
        style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
      >
        {copied ? "Copied" : "Copy"}
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
