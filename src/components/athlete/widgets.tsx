"use client";

import { localDay } from "@/lib/day";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { severityColor } from "@/lib/severityColor";

/* ---------- join / leave a team ---------- */

export function TeamMembership({ teamName }: { teamName: string | null }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/athlete/join-team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joinCode: code }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      router.refresh();
    } else {
      setErr(d.error || "Couldn't join that team.");
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    await fetch("/api/athlete/join-team", { method: "DELETE" });
    router.refresh();
  }

  if (teamName) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm" style={{ color: "var(--ink-2)" }}>
          You&apos;re on <b style={{ color: "var(--ink)" }}>{teamName}</b> — your coach can see your training.
        </span>
        <button
          onClick={leave}
          disabled={busy}
          className="text-xs font-medium rounded-lg border px-3 py-1.5 cursor-pointer disabled:opacity-60"
          style={{ borderColor: "var(--hairline)", color: "var(--ink-muted)" }}
        >
          Leave team
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm mb-3" style={{ color: "var(--ink-2)" }}>
        You&apos;re riding solo — the whole app is yours. Got a code from a coach? Join their team and
        you&apos;ll show up on their roster.
      </p>
      <form onSubmit={join} className="flex flex-wrap gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Team code"
          autoCapitalize="characters"
          className="flex-1 min-w-40 rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-amber-500 tracking-wider font-medium"
          style={{ borderColor: "var(--hairline)" }}
        />
        <button
          disabled={busy || !code.trim()}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60 cursor-pointer"
          style={{ background: "var(--brand)" }}
        >
          {busy ? "Joining…" : "Join team"}
        </button>
      </form>
      {err && <p className="text-sm mt-2" style={{ color: "var(--status-serious)" }}>{err}</p>}
    </div>
  );
}

/* ---------- pair the iPhone app (copy device token) ---------- */

export function CopyToken({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <button
      onClick={copy}
      className="w-full flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left cursor-pointer"
      style={{ borderColor: "var(--hairline)", background: "var(--surface-2)" }}
    >
      <code className="flex-1 text-sm truncate" style={{ color: "var(--ink-2)" }}>{token}</code>
      <span className="text-xs font-semibold shrink-0" style={{ color: "var(--brand-strong)" }}>
        {copied ? "Copied!" : "Copy"}
      </span>
    </button>
  );
}

/* ---------- quick soreness check-in (1-10 tap) ---------- */

/* regions match AthleteModel's anatomy map so the body scan lights up correctly */
const SORE_PARTS: { k: string; label: string; lateral: boolean }[] = [
  { k: "shin", label: "Shin", lateral: true },
  { k: "calf", label: "Calf", lateral: true },
  { k: "knee", label: "Knee", lateral: true },
  { k: "hamstring", label: "Hamstring", lateral: true },
  { k: "quad", label: "Quad", lateral: true },
  { k: "hip", label: "Hip / IT band", lateral: true },
  { k: "achilles", label: "Achilles", lateral: true },
  { k: "foot", label: "Foot", lateral: true },
  { k: "lower back", label: "Lower back", lateral: false },
  { k: "shoulder", label: "Shoulder", lateral: true },
];

export function CheckinWidget({
  athleteId,
  initialSoreness,
}: {
  athleteId: number;
  initialSoreness: Record<string, number>;
}) {
  const [busy, setBusy] = useState(false);
  const [soreness, setSoreness] = useState<Record<string, number>>(initialSoreness);
  const [part, setPart] = useState<string | null>(null);
  const [side, setSide] = useState<"left" | "right" | "both" | null>(null);
  const router = useRouter();

  const region = SORE_PARTS.find((p) => p.k === part) ?? null;
  // for a lateral part, a side must be chosen before it's loggable — no bare "shin" entries
  const sorenessKey = part ? (region?.lateral ? (side ? `${side} ${part}` : null) : part) : null;
  const currentSeverity = sorenessKey ? soreness[sorenessKey] ?? null : null;

  async function clearKey(key: string) {
    await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteId, sorenessSeverity: null, sorenessPart: key }),
    });
  }

  async function clearSoreness(key: string) {
    setBusy(true);
    await clearKey(key);
    setSoreness((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setBusy(false);
    router.refresh();
  }

  async function submit(v: number | null) {
    if (!sorenessKey || !part) return;
    setBusy(true);
    // "both" supersedes separately-logged left/right; logging one side makes a prior "both" stale
    const toClear =
      side === "both" ? [`left ${part}`, `right ${part}`] : side ? [`both ${part}`] : [];
    await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteId, sorenessSeverity: v, sorenessPart: sorenessKey }),
    });
    for (const key of toClear) {
      if (soreness[key] != null) await clearKey(key);
    }
    setSoreness((prev) => {
      const next = { ...prev };
      if (v === null) delete next[sorenessKey];
      else next[sorenessKey] = v;
      for (const key of toClear) delete next[key];
      return next;
    });
    setBusy(false);
    router.refresh();
  }

  const loggedParts = Object.entries(soreness);

  return (
    <div>
      <div className="text-xs mb-2" style={{ color: "var(--ink-muted)" }}>
        How sore are you today?{" "}
        {loggedParts.length > 0 && (
          <span style={{ color: "var(--brand-strong)" }}>
            Logged: {loggedParts.map(([p, v]) => `${p} ${v}/10`).join(" · ")}
          </span>
        )}
      </div>

      {/* where? — each chip is colored by that part's own logged severity, independent of the others */}
      <div className="text-[11px] mb-1.5" style={{ color: "var(--ink-muted)" }}>
        Where? <span style={{ opacity: 0.7 }}>(tap to score — lights up the body scan)</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {SORE_PARTS.map((p) => {
          // a lateral part may be logged under "left knee"/"right knee"/"both knee" rather
          // than the bare key — the chip should still light up, colored by the worst side
          const matches = [p.k, `left ${p.k}`, `right ${p.k}`, `both ${p.k}`]
            .map((k) => soreness[k])
            .filter((v): v is number => v != null);
          const partSeverity = matches.length ? Math.max(...matches) : null;
          const isSelected = part === p.k;
          return (
            <button
              key={p.k}
              type="button"
              disabled={busy}
              onClick={() => setPart(part === p.k ? null : p.k)}
              className="px-2.5 h-7 rounded-lg text-xs font-medium cursor-pointer transition-colors"
              style={{
                background: partSeverity !== null ? severityColor(partSeverity) : "var(--surface-2)",
                color: partSeverity !== null ? "#fff" : "var(--ink-2)",
                border: isSelected ? "2px solid var(--ink)" : "1px solid var(--hairline)",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* which side? — only for lateral regions */}
      {region?.lateral && (
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>Side:</span>
          {(["left", "right", "both"] as const).map((s) => {
            // stays highlighted (by severity color) whenever that side has a real logged
            // score, independent of whether it's the one currently being edited
            const sideSeverity = part ? soreness[`${s} ${part}`] ?? null : null;
            const isSideSelected = side === s;
            return (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => {
                  // clicking the already-selected side again clears its score (if any),
                  // same "tap again to clear" pattern as the severity buttons below
                  if (isSideSelected && sideSeverity !== null) {
                    clearSoreness(`${s} ${part}`);
                    setSide(null);
                  } else {
                    setSide(side === s ? null : s);
                  }
                }}
                className="px-2.5 h-7 rounded-lg text-xs font-medium cursor-pointer capitalize transition-colors"
                style={{
                  background: sideSeverity !== null ? severityColor(sideSeverity) : "var(--surface-2)",
                  color: sideSeverity !== null ? "#fff" : "var(--ink-2)",
                  border: isSideSelected ? "2px solid var(--ink)" : "1px solid var(--hairline)",
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}

      {/* how sore? — scoped to whichever part+side is currently selected above; tap the active value to clear it */}
      {part && region?.lateral && !side && (
        <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
          Choose a side above to log severity.
        </div>
      )}
      {sorenessKey && (
        <>
          <div className="text-[11px] mb-1.5" style={{ color: "var(--ink-muted)" }}>
            Severity for {sorenessKey}
            {currentSeverity !== null && (
              <span className="font-semibold" style={{ color: severityColor(currentSeverity) }}>
                {" "}
                — {currentSeverity}/10
              </span>
            )}{" "}
            <span style={{ opacity: 0.7 }}>(tap again to clear)</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 11 }, (_, i) => i).map((v) => (
              <button
                key={v}
                disabled={busy}
                onClick={() => submit(currentSeverity === v ? null : v)}
                className="w-8 h-8 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                style={{
                  background: currentSeverity === v ? severityColor(v) : "var(--surface-2)",
                  color: currentSeverity === v ? "#fff" : "var(--ink-2)",
                  border: "1px solid var(--hairline)",
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- workout done / modified / skipped ---------- */

export function PlanStatusButtons({
  athleteId,
  date,
  status,
}: {
  athleteId: number;
  date: string;
  status: string | null;
}) {
  const [cur, setCur] = useState<string | null>(status);
  const router = useRouter();

  async function set(s: string | null) {
    setCur(s);
    await fetch("/api/workout-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteId, date, status: s }),
    });
    router.refresh();
  }

  const opts: { key: string; label: string; color: string }[] = [
    { key: "done", label: "Done", color: "var(--status-good)" },
    { key: "modified", label: "Modified", color: "var(--status-warning)" },
    { key: "skipped", label: "Skipped", color: "var(--ink-muted)" },
  ];
  return (
    <span className="inline-flex gap-1.5">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => set(cur === o.key ? null : o.key)}
          title={cur === o.key ? "Click to clear" : undefined}
          className="text-[11px] rounded-full border px-2.5 py-1 cursor-pointer font-medium"
          style={{
            borderColor: cur === o.key ? o.color : "var(--hairline)",
            color: cur === o.key ? o.color : "var(--ink-muted)",
            background: cur === o.key ? "color-mix(in oklab, " + o.color + " 12%, transparent)" : "transparent",
          }}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/* ---------- AI chat ---------- */

const SUGGESTED = [
  "Should I run today, my legs are really sore?",
  "How do I run a faster 800m?",
  "Am I on track to break 5 minutes in the mile?",
  "What should I do the day before my race?",
  "Why is my pace getting slower even though I'm training more?",
];

export function ChatBox({ athleteId }: { athleteId: number }) {
  const [msgs, setMsgs] = useState<{ role: string; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/chat?athleteId=${athleteId}`)
      .then((r) => r.json())
      .then((d) => setMsgs(d.history ?? []))
      .catch(() => {});
  }, [athleteId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteId, message: text }),
      });
      const d = await res.json();
      setMsgs((m) => [...m, { role: "assistant", text: d.reply ?? d.error ?? "Something went wrong." }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "Couldn't reach the server." }]);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col" style={{ height: 520 }}>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {msgs.length === 0 && (
          <div className="text-sm space-y-2 pt-2" style={{ color: "var(--ink-muted)" }}>
            <p>Ask anything about your training — I&apos;m reading your last 14 days of data automatically, and I get smarter the longer you use me.</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
              style={
                m.role === "user"
                  ? { background: "var(--brand)", color: "#000" }
                  : { background: "var(--surface-2)", color: "var(--ink-2)", border: "1px solid var(--hairline)" }
              }
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="text-xs" style={{ color: "var(--ink-muted)" }}>
            RunGuard is reading your data…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex flex-wrap gap-1.5 py-2">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            className="text-[11px] rounded-full border px-2.5 py-1 cursor-pointer hover:opacity-70"
            style={{ borderColor: "var(--hairline)", color: "var(--ink-muted)" }}
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your training…"
          className="flex-1 rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-amber-500"
          style={{ borderColor: "var(--hairline)" }}
        />
        <button
          disabled={busy || !input.trim()}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50 cursor-pointer"
          style={{ background: "var(--brand)" }}
        >
          Send
        </button>
      </form>
      {/* Persistent, not in the empty state — it used to sit inside
          {msgs.length === 0 && …} and vanish forever after the first message, so
          a returning athlete never saw it. Reworded because the coach panel
          shows the last five messages verbatim, in quotes, not a summary. */}
      <p className="text-xs pt-2" style={{ color: "var(--ink-muted)" }}>
        Your coach can read your last 5 messages here, word for word.
      </p>
    </div>
  );
}

/* ---------- post-race log ---------- */

export function RaceLogForm({ athleteId, events }: { athleteId: number; events: string[] }) {
  const [event, setEvent] = useState(events[0]);
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const [feel, setFeel] = useState("ok");
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const m = time.trim().match(/^(\d{1,2}):(\d{2})(?:\.\d+)?$/);
    if (!m) {
      setMsg("Time format: M:SS (e.g. 5:04)");
      return;
    }
    const timeS = parseInt(m[1]) * 60 + parseInt(m[2]);
    const res = await fetch("/api/race-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        athleteId,
        event,
        timeS,
        place: place ? parseInt(place) : undefined,
        feel,
      }),
    });
    if (res.ok) {
      setMsg("Logged ✓");
      setTime("");
      setPlace("");
      router.refresh();
    } else setMsg("Couldn't save.");
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <select value={event} onChange={(e) => setEvent(e.target.value)} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--hairline)", background: "var(--page)" }}>
        {events.map((ev) => (
          <option key={ev}>{ev}</option>
        ))}
      </select>
      <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="Time (5:04)" className="w-28 rounded-xl border bg-transparent px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--hairline)" }} />
      <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Place" className="w-20 rounded-xl border bg-transparent px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--hairline)" }} />
      <select value={feel} onChange={(e) => setFeel(e.target.value)} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--hairline)", background: "var(--page)" }}>
        <option value="great">Felt great</option>
        <option value="ok">Felt ok</option>
        <option value="rough">Felt rough</option>
      </select>
      <button className="rounded-xl px-4 py-2 text-sm font-semibold text-black cursor-pointer" style={{ background: "var(--brand)" }}>
        Log race
      </button>
      {msg && (
        <span className="text-xs" style={{ color: msg.includes("✓") ? "var(--status-good)" : "var(--status-serious)" }}>
          {msg}
        </span>
      )}
    </form>
  );
}

/* ---------- add an upcoming race (self-owned; coach/seed races can't be removed) ---------- */

export function RaceForm({ athleteId, events }: { athleteId: number; events: string[] }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [event, setEvent] = useState(events[0]);
  const [distanceMi, setDistanceMi] = useState("");
  const [location, setLocation] = useState("");
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const distanceM = parseFloat(distanceMi) * 1609.344;
    const missing: string[] = [];
    if (!name.trim()) missing.push("race name");
    if (!date) missing.push("date");
    if (!distanceM) missing.push("distance");
    if (missing.length) {
      setMsg(`Please fill in: ${missing.join(", ")}.`);
      return;
    }
    if (date < localDay()) {
      setMsg("That race date is in the past — pick an upcoming date.");
      return;
    }
    const res = await fetch("/api/race", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteId, name, date, event, distanceM, location: location || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMsg("Added ✓");
      setName("");
      setDate("");
      setDistanceMi("");
      setLocation("");
      router.refresh();
    } else {
      setMsg(data.error || "Couldn't save.");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Race name" className="w-40 rounded-xl border bg-transparent px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--hairline)" }} />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl border bg-transparent px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--hairline)" }} />
      <select value={event} onChange={(e) => setEvent(e.target.value)} className="rounded-xl border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--hairline)", background: "var(--page)" }}>
        {events.map((ev) => (
          <option key={ev}>{ev}</option>
        ))}
      </select>
      <input value={distanceMi} onChange={(e) => setDistanceMi(e.target.value)} placeholder="Distance (mi)" className="w-28 rounded-xl border bg-transparent px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--hairline)" }} />
      <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" className="w-40 rounded-xl border bg-transparent px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--hairline)" }} />
      <button className="rounded-xl px-4 py-2 text-sm font-semibold text-black cursor-pointer" style={{ background: "var(--brand)" }}>
        Add race
      </button>
      {msg && (
        <span className="text-xs" style={{ color: msg.includes("✓") ? "var(--status-good)" : "var(--status-serious)" }}>
          {msg}
        </span>
      )}
    </form>
  );
}

export function RaceEditControls({ athleteId, raceId }: { athleteId: number; raceId: number }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function remove() {
    if (!confirm("Remove this race?")) return;
    setBusy(true);
    await fetch(`/api/race/${raceId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteId }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={remove}
      className="text-xs font-medium cursor-pointer"
      style={{ color: "var(--status-serious, #dc2626)" }}
    >
      Remove
    </button>
  );
}

/**
 * Max heart rate control.
 *
 * Intensity for every run is scored as a fraction of this number, so it is
 * worth getting right — but there is no reliable way to know it automatically.
 * The athlete sees what the app is currently using and where it came from, and
 * can override it if they know better. Clearing returns to automatic.
 */
export function HrMaxSetting({
  value,
  source,
  label,
}: {
  value: number;
  source: string;
  label: string;
}) {
  const [entry, setEntry] = useState(String(value));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const isSet = source === "manual" || source === "calibrated";

  async function send(hrMax: number | null) {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/hrmax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hrMax }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      router.refresh();
      setBusy(false);
    } else {
      setErr(d.error || "Couldn't save that.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-3xl font-extrabold tabular-nums">{value}</span>
        <span className="text-sm" style={{ color: "var(--ink-muted)" }}>bpm · {label}</span>
      </div>

      <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
        Every run&apos;s intensity is scored against this number, so it feeds your training load,
        workload ratio and TRIMP. If you know your real max from a test or a hard race, enter it —
        it&apos;s more accurate than anything we can infer.
      </p>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(Number(entry));
        }}
      >
        <input
          type="number"
          inputMode="numeric"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          className="rounded-xl border px-3 py-2 text-sm w-28 tabular-nums"
          style={{ borderColor: "var(--hairline)", background: "var(--surface-2)" }}
          aria-label="Max heart rate in bpm"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--ember)", color: "#000" }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {isSet && (
          <button
            type="button"
            disabled={busy}
            onClick={() => send(null)}
            className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
            style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
          >
            Use automatic
          </button>
        )}
      </form>

      {err && <p className="text-sm" style={{ color: "var(--status-critical)" }}>{err}</p>}

      <details className="text-sm" style={{ color: "var(--ink-muted)" }}>
        <summary className="cursor-pointer">How to find your real max</summary>
        <p className="mt-2 leading-relaxed">
          The most accurate figure comes from an all-out effort: after a full warm-up, run hard
          uphill for 3 minutes, jog 2 minutes, then repeat going as hard as you can to the finish.
          The highest number your watch records is close to your true max. Do it fresh, not on tired
          legs, and not without your coach knowing.
        </p>
      </details>
    </div>
  );
}
