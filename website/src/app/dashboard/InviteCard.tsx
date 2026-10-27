"use client";

import { useState } from "react";

export default function InviteCard({ joinCode }: { joinCode: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the code is visible anyway */
    }
  }

  return (
    <button
      onClick={copy}
      className="lift rounded-xl border px-4 py-2 text-left cursor-pointer"
      style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
      title="Copy your team join code"
    >
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
        {copied ? "Copied!" : "Team code: tap to copy"}
      </div>
      <div className="text-sm font-bold tracking-wider" style={{ color: "var(--brand-strong)" }}>
        {joinCode}
      </div>
    </button>
  );
}
