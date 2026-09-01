"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function CoachSignupForm() {
  const params = useSearchParams();
  const [coachName, setCoachName] = useState("");
  const [teamName, setTeamName] = useState("");
  // Prefilled when Google sign-in recognised nobody. The address is verified
  // by Google, but no account stands behind it yet — and nothing else this form
  // needs can be derived from an OIDC claim, which is why the callback sends
  // people here instead of inventing the rest.
  const [email, setEmail] = useState(() => params.get("email") ?? "");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");


  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachName, teamName, email, password: pw }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setCode(d.joinCode);
    } else {
      setErr(d.error || "Couldn't create your team.");
      setBusy(false);
    }
  }

  if (code) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div
          className="w-full max-w-sm rounded-2xl border p-8 text-center"
          style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
        >
          <div className="text-2xl">🎉</div>
          <h1 className="text-xl font-bold mt-2">{teamName} is live</h1>
          <p className="text-sm mt-2" style={{ color: "var(--ink-muted)" }}>
            Share this code with your athletes. They sign up with it and appear on your roster.
          </p>
          <div
            className="mt-4 rounded-xl border px-6 py-4"
            style={{ borderColor: "var(--brand)", background: "color-mix(in oklab, var(--brand) 8%, var(--surface))" }}
          >
            <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>Team code</div>
            <div className="text-3xl font-extrabold tracking-wider" style={{ color: "var(--brand-strong)" }}>{code}</div>
          </div>
          <button
            onClick={() => {
              router.push("/dashboard");
              router.refresh();
            }}
            className="w-full mt-5 rounded-xl py-2.5 text-sm font-semibold text-black cursor-pointer"
            style={{ background: "var(--brand)" }}
          >
            Go to my dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div
        className="w-full max-w-sm rounded-2xl border p-8"
        style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
      >
        <Link href="/" className="text-sm" style={{ color: "var(--ink-muted)" }}>
          ← Back
        </Link>
        <h1 className="text-xl font-bold mt-4">Create your team</h1>
        <p className="text-sm mt-1 mb-6" style={{ color: "var(--ink-muted)" }}>
          Coaches start here. Already have a team?{" "}
          <Link href="/login" style={{ color: "var(--brand-strong)" }} className="font-medium">
            Log in
          </Link>
        </p>
        <form onSubmit={submit} className="space-y-3">
          {[
            { v: coachName, set: setCoachName, ph: "Your name", type: "text" as const },
            { v: teamName, set: setTeamName, ph: "Team name (e.g. Leland XC)", type: "text" as const },
            { v: email, set: setEmail, ph: "Email", type: "email" as const },
            { v: pw, set: setPw, ph: "Password (8+ characters)", type: "password" as const },
          ].map((f, i) => (
            <input
              key={i}
              type={f.type}
              value={f.v}
              onChange={(e) => f.set(e.target.value)}
              placeholder={f.ph}
              autoCapitalize={f.type === "email" ? "none" : "words"}
              className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-amber-500"
              style={{ borderColor: "var(--hairline)" }}
            />
          ))}
          {err && (
            <p className="text-sm" style={{ color: "var(--status-serious)" }}>
              {err}
            </p>
          )}
          <button
            disabled={busy}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-black disabled:opacity-60 cursor-pointer"
            style={{ background: "var(--brand)" }}
          >
            {busy ? "Creating…" : "Create team"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* useSearchParams must sit inside a Suspense boundary: unsuspended, it fails
   the BUILD rather than the request. Same reason RangePicker is wrapped in
   dashboard/page.tsx. */
export default function CoachSignup() {
  return (
    <Suspense>
      <CoachSignupForm />
    </Suspense>
  );
}
