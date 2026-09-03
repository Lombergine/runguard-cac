"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * Request a reset link. `?role=coach` picks the coach table; anything else is an
 * athlete.
 *
 * THE CONFIRMATION IS THE SAME WHETHER OR NOT THE ACCOUNT EXISTS, because the
 * route's answer is. Saying "no account with that email" here would rebuild the
 * membership oracle the route is careful not to be — and the membership in
 * question is which minors are registered. So the wording has to stay
 * conditional ("if that account exists"), however unhelpful that feels.
 */
function ForgotForm() {
  const role = useSearchParams().get("role") === "coach" ? "coach" : "athlete";
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setSent(true);
    else setErr(d.error || "Something went wrong. Try again.");
    setBusy(false);
  }

  const backTo = role === "coach" ? "/login" : "/athlete/login";

  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div
        className="w-full max-w-sm rounded-2xl border p-8"
        style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
      >
        <Link href={backTo} className="text-sm" style={{ color: "var(--ink-muted)" }}>
          ← Back
        </Link>

        {sent ? (
          <>
            <h1 className="text-xl font-bold mt-4">Check your email</h1>
            <p className="text-sm mt-2" style={{ color: "var(--ink-muted)" }}>
              If that account exists, a reset link is on its way. It works once and
              stops working after an hour.
            </p>
            <p className="text-sm mt-4" style={{ color: "var(--ink-muted)" }}>
              Nothing arrived? Check spam, then try again — requesting a new link
              cancels the previous one.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold mt-4">
              {role === "coach" ? "Reset coach password" : "Reset your password"}
            </h1>
            <p className="text-sm mt-1 mb-6" style={{ color: "var(--ink-muted)" }}>
              We&rsquo;ll email a link that lets you choose a new one.
            </p>
            <form onSubmit={submit} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={role === "coach" ? "Coach email" : "you@school.edu"}
                autoFocus
                autoCapitalize="none"
                className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-amber-500"
                style={{ borderColor: "var(--hairline)" }}
              />
              {err && (
                <p className="text-sm" style={{ color: "var(--status-serious)" }}>
                  {err}
                </p>
              )}
              <button
                disabled={busy || !email.trim()}
                className="w-full rounded-xl py-2.5 text-sm font-semibold text-black disabled:opacity-60 cursor-pointer"
                style={{ background: "var(--brand)" }}
              >
                {busy ? "Sending…" : "Email me a link"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* useSearchParams must sit inside a Suspense boundary: unsuspended, it fails the
   BUILD rather than the request. */
export default function Forgot() {
  return (
    <Suspense>
      <ForgotForm />
    </Suspense>
  );
}
