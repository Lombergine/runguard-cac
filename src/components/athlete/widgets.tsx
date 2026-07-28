"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

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

export function CheckinWidget({ athleteId, current }: { athleteId: number; current: number | null }) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<number | null>(current);
  const [part, setPart] = useState<string | null>(null);
  const [side, setSide] = useState<"left" | "right" | "both" | null>(null);
  const router = useRouter();

  const region = SORE_PARTS.find((p) => p.k === part) ?? null;
  const sorenessPart = part
    ? region?.lateral && side
      ? `${side} ${part}`
      : part
    : null;

  async function submit(v: number) {
    setBusy(true);
    await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteId, sorenessSeverity: v, sorenessPart }),
    });
    setSaved(v);
    setBusy(false);
    router.refresh();
  }

  const chip = (active: boolean): CSSProperties => ({
    background: active ? "var(--brand-strong, #ea580c)" : "var(--surface-2)",
    color: active ? "#fff" : "var(--ink-2)",
    border: "1px solid var(--hairline)",
  });

  return (
    <div>
      <div className="text-xs mb-2" style={{ color: "var(--ink-muted)" }}>
        How sore are you today?{" "}
        {saved !== null && (
          <span style={{ color: "var(--brand-strong)" }}>
            Logged: {saved}/10{sorenessPart ? ` · ${sorenessPart}` : ""}
          </span>
        )}
      </div>

      {/* where? */}
      <div className="text-[11px] mb-1.5" style={{ color: "var(--ink-muted)" }}>
        Where? <span style={{ opacity: 0.7 }}>(optional — lights up the body scan)</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {SORE_PARTS.map((p) => (
          <button
            key={p.k}
            type="button"
            disabled={busy}
            onClick={() => setPart(part === p.k ? null : p.k)}
            className="px-2.5 h-7 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            style={chip(part === p.k)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* which side? — only for lateral regions */}
      {region?.lateral && (
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>Side:</span>
          {(["left", "right", "both"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => setSide(side === s ? null : s)}
              className="px-2.5 h-7 rounded-lg text-xs font-medium cursor-pointer capitalize transition-colors"
              style={chip(side === s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* how sore? */}
      <div className="text-[11px] mb-1.5" style={{ color: "var(--ink-muted)" }}>Severity</div>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
          <button
            key={v}
            disabled={busy}
            onClick={() => submit(v)}
            className="w-8 h-8 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            style={{
              background:
                saved === v
                  ? v >= 7
                    ? "var(--status-critical)"
                    : v >= 4
                      ? "var(--status-warning)"
                      : "var(--status-good)"
                  : "var(--surface-2)",
              color: saved === v ? "#000" : "var(--ink-2)",
              border: "1px solid var(--hairline)",
            }}
          >
            {v}
          </button>
        ))}
      </div>
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
  const [cur, setCur] = useState(status);
  const router = useRouter();

  async function set(s: string) {
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
          onClick={() => set(o.key)}
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
            <p className="text-xs">Your coach can see a summary of what you&apos;ve been asking.</p>
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
