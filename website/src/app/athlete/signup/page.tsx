"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const EVENT_GROUPS = [
  { id: "distance", label: "Distance (5K / XC)" },
  { id: "mid", label: "Mid (800 / Mile)" },
  { id: "sprint", label: "Sprint" },
];

function AthleteSignupForm() {
  const params = useSearchParams();
  const [name, setName] = useState("");
  // Prefilled when Google sign-in recognised nobody. The address is verified
  // by Google, but no account stands behind it yet — and nothing else this form
  // needs can be derived from an OIDC claim, which is why the callback sends
  // people here instead of inventing the rest.
  const [email, setEmail] = useState(() => params.get("email") ?? "");
  const [pw, setPw] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [grade, setGrade] = useState("");
  const [eventGroup, setEventGroup] = useState("distance");
  const [err, setErr] = useState("");


  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/athlete-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password: pw,
        joinCode,
        grade: grade ? Number(grade) : null,
        eventGroup,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      router.push("/athlete");
      router.refresh();
    } else {
      setErr(d.error || "Couldn't create your account.");
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8">
      <div
        className="w-full max-w-sm rounded-2xl border p-8"
        style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
      >
        <Link href="/" className="text-sm" style={{ color: "var(--ink-muted)" }}>
          ← Back
        </Link>
        <h1 className="text-xl font-bold mt-4">Create your account</h1>
        <p className="text-sm mt-1 mb-6" style={{ color: "var(--ink-muted)" }}>
          Sign up on your own — no team needed. Already have an account?{" "}
          <Link href="/athlete/login" style={{ color: "var(--brand-strong)" }} className="font-medium">
            Log in
          </Link>
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Team code (optional — leave blank to go solo)"
            autoCapitalize="characters"
            className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-amber-500 tracking-wider font-medium"
            style={{ borderColor: "var(--hairline)" }}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-amber-500"
            style={{ borderColor: "var(--hairline)" }}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoCapitalize="none"
            className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-amber-500"
            style={{ borderColor: "var(--hairline)" }}
          />
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Password (8+ characters)"
            className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-amber-500"
            style={{ borderColor: "var(--hairline)" }}
          />
          <div className="flex gap-3">
            <input
              type="number"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="Grade"
              min={9}
              max={12}
              className="w-24 rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none focus:border-amber-500"
              style={{ borderColor: "var(--hairline)" }}
            />
            <select
              value={eventGroup}
              onChange={(e) => setEventGroup(e.target.value)}
              className="flex-1 rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none focus:border-amber-500"
              style={{ borderColor: "var(--hairline)" }}
            >
              {EVENT_GROUPS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
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
            {busy ? "Creating…" : "Create my account"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* useSearchParams must sit inside a Suspense boundary: unsuspended, it fails
   the BUILD rather than the request. Same reason RangePicker is wrapped in
   dashboard/page.tsx. */
export default function AthleteSignup() {
  return (
    <Suspense>
      <AthleteSignupForm />
    </Suspense>
  );
}
