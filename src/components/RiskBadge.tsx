const CFG = {
  ready: {
    color: "var(--status-good)",
    label: "Ready",
    icon: "M5 13l4 4L19 7", // check
  },
  caution: {
    color: "var(--status-warning)",
    label: "Caution",
    icon: "M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z", // triangle
  },
  high: {
    color: "var(--status-critical)",
    label: "High risk",
    icon: "M12 8v4m0 4h.01M22 12a10 10 0 11-20 0 10 10 0 0120 0z", // alert circle
  },
} as const;

export default function RiskBadge({
  zone,
  score,
  size = "md",
}: {
  zone: keyof typeof CFG;
  score?: number;
  size?: "md" | "lg";
}) {
  const c = CFG[zone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${
        size === "lg" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"
      }`}
      style={{
        color: c.color,
        borderColor: "color-mix(in oklab, " + c.color + " 45%, transparent)",
        background: "color-mix(in oklab, " + c.color + " 12%, transparent)",
      }}
    >
      <svg
        width={size === "lg" ? 15 : 13}
        height={size === "lg" ? 15 : 13}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={c.icon} />
      </svg>
      {c.label}
      {typeof score === "number" && (
        <span className="opacity-80 font-normal">· {score}</span>
      )}
    </span>
  );
}
