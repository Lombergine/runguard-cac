"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * Choose a new password, having arrived from a reset email.
 *
 * NO SESSION IS ISSUED. On success this points at the login form rather than
 * signing anyone in — see the note in api/password/reset/route.ts. It costs one
 * extra step and means an intercepted link cannot quietly become a session.
 */
function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"athlete" | "coach" | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: pw }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      // Clear it out of component state on the way out, so no render after this
      // can put the new password back on screen.
      setPw("");
      setDone(d.role === "coach" ? "coach" : "athlete");
    } else {
      setErr(d.error || "That didn't work. Request a new link.");
    }
    setBusy(false);
  }

  const card = "w-full max-w-sm rounded-2xl border p-8";
  const style = { borderColor: "var(--hairline)", background: "var(--surface)" };

  if (done) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className={card} style={style}>
          <h1 className="text-xl font-bold">Password changed</h1>
          <p className="text-sm mt-2 mb-6" style={{ color: "var(--ink-muted)" }}>
            Anyone who was signed in to this account has been signed out, including
            on the phone. Sign in again with the new password.
          </p>
          <Link
            href={done === "coach" ? "/login" : "/athlete/login"}
            className="block w-full rounded-xl py-2.5 text-sm font-semibold text-black text-center"
            style={{ background: "var(--brand)" }}
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  // A link that arrived without a token is not worth a form.
  if (!token) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className={card} style={style}>
          <h1 className="text-xl font-bold">That link is incomplete</h1>
          <p className="text-sm mt-2 mb-6" style={{ color: "var(--ink-muted)" }}>
            Reset links sometimes get cut in half by email clients. Request a new
            one and open it in a single click.
          </p>
          <Link href="/forgot" className="text-sm font-medium" style={{ color: "var(--brand-strong)" }}>
            Request a new link →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className={card} style={style}>
        <h1 className="text-xl font-bold">Choose a new password</h1>
        <p className="text-sm mt-1 mb-6" style={{ color: "var(--ink-muted)" }}>
          At least 8 characters. This also signs out anyone already using the
          account.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="New password"
            autoFocus
            autoComplete="new-password"
            className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-amber-500"
            style={{ borderColor: "var(--hairline)" }}
          />
          {err && (
            <p className="text-sm" style={{ color: "var(--status-serious)" }}>
              {err}
            </p>
          )}
          <button
            disabled={busy || pw.length < 8}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-black disabled:opacity-60 cursor-pointer"
            style={{ background: "var(--brand)" }}
          >
            {busy ? "Saving…" : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* useSearchParams must sit inside a Suspense boundary: unsuspended, it fails the
   BUILD rather than the request. Same reason RangePicker is wrapped in
   dashboard/page.tsx. */
export default function Reset() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
