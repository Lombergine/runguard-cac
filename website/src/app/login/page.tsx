"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pw }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setErr(d.error || "Email or password is incorrect.");
      setBusy(false);
    }
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
        <h1 className="text-xl font-bold mt-4">Coach login</h1>
        <p className="text-sm mt-1 mb-6" style={{ color: "var(--ink-muted)" }}>
          New here?{" "}
          <Link href="/signup" style={{ color: "var(--brand-strong)" }} className="font-medium">
            Create your team →
          </Link>
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Coach email"
            autoFocus
            autoCapitalize="none"
            className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-amber-500"
            style={{ borderColor: "var(--hairline)" }}
          />
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-amber-500"
            style={{ borderColor: "var(--hairline)" }}
          />
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
            {busy ? "Signing in…" : "Open dashboard"}
          </button>
        </form>
        {/*
          A LINK, not a fetch.
          
          This button used to POST `{ password: "milemarker" }` to /api/login — a
          password hardcoded into a public repository, which stopped working the
          moment coach accounts became real, and then sat here failing with
          "Couldn't open the demo." for every visitor who pressed it. It was the
          first thing a curious coach clicked.
          
          /api/demo/coach opens a read-only session for the sample team and
          redirects. There is no credential in it to go stale.
        */}
        <Link
          href="/api/demo/coach"
          prefetch={false}
          className="block w-full mt-3 rounded-xl border py-2.5 text-sm font-medium text-center"
          style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
        >
          Look around a sample team instead
        </Link>
      </div>
    </div>
  );
}
