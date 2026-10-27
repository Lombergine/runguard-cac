"use client";

import { useState } from "react";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("coach");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    setState(res.ok ? "done" : "error");
  }

  if (state === "done") {
    return (
      <p className="mt-8 text-sm font-medium" style={{ color: "var(--status-good)" }}>
        ✓ You&apos;re on the list. We&apos;ll be in touch soon.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none"
        style={{ borderColor: "var(--hairline)", background: "var(--page)" }}
      >
        <option value="coach">I&apos;m a coach</option>
        <option value="athlete">I&apos;m an athlete</option>
        <option value="parent">I&apos;m a parent</option>
      </select>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@school.edu"
        className="flex-1 max-w-xs rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-amber-500"
        style={{ borderColor: "var(--hairline)" }}
      />
      <button
        disabled={state === "busy"}
        className="rounded-xl px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60 cursor-pointer"
        style={{ background: "var(--brand)" }}
      >
        {state === "busy" ? "Joining…" : "Join waitlist"}
      </button>
      {state === "error" && (
        <p className="text-sm self-center" style={{ color: "var(--status-serious)" }}>
          Something went wrong: try again.
        </p>
      )}
    </form>
  );
}
