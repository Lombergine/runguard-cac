"use client";
/**
 * "Explain these numbers": asks the server to explain the audit and shows
 * the answer beside exactly what the model saw, with who wrote the words.
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import { useState } from "react";

type Result = {
  input: Record<string, unknown>;
  explanation: { summary: string; caution: string; citation: string };
  source: "anthropic" | "ollama" | "template";
  model: string | null;
  fallbackReason: string | null;
  rejectedReply: string | null;
};

export default function ExplainButton({ athleteId }: { athleteId?: number }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [r, setR] = useState<Result | null>(null);
  const muted = { color: "var(--ink-muted)" } as const;

  async function go() {
    setState("loading");
    try {
      const res = await fetch(`/api/explain${athleteId ? `?athlete=${athleteId}` : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setR((await res.json()) as Result);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold">Explain these numbers</h2>
        <span className="text-xs" style={muted}>the model explains; it never computes</span>
      </div>
      {state !== "done" ? (
        <button
          type="button"
          onClick={go}
          disabled={state === "loading"}
          className="rounded-xl px-4 py-2 text-sm font-semibold"
          style={{ background: "var(--brand)", color: "var(--on-brand, #25100A)" }}
        >
          {state === "loading" ? "Explaining…" : state === "error" ? "Try again" : "Explain in plain words"}
        </button>
      ) : r ? (
        <div className="grid lg:grid-cols-2 gap-4">
          <div>
            <p className="text-sm">{r.explanation.summary}</p>
            <p className="text-sm mt-2" style={muted}>{r.explanation.caution}</p>
            <p className="text-xs mt-2 italic" style={muted}>{r.explanation.citation}</p>
            <p className="text-xs mt-3" style={muted}>
              {r.source === "template"
                ? `RunGuard’s own wording — ${r.fallbackReason}.`
                : `Written by ${r.model} from the numbers on the right, validated against them: every figure in the reply had to appear in the input.`}
            </p>
          </div>
          <pre className="text-[11px] leading-relaxed rounded-xl p-3 overflow-x-auto" style={{ background: "var(--surface-2)", color: "var(--ink-2, var(--ink))" }}>
            {JSON.stringify(r.input, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
