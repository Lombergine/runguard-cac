"use client";

import { useMemo } from "react";

/* ------------------------------------------------------------------ *
 *  AthleteModel — holographic body-scan
 *  Ambient tint  = overall readiness zone (objective, from load/recovery)
 *  Glowing spots = specific flagged areas, colored by severity:
 *     • logged injuries        → red (persistent flag)
 *     • soreness check-ins      → red / amber / gold by 1–10 severity
 *  Placement is anatomy-aware (left / right + ~18 regions).
 * ------------------------------------------------------------------ */

type Zone = "ready" | "caution" | "high";

const ZONE_COLOR: Record<Zone, string> = {
  ready: "#16a34a",
  caution: "#d97706",
  high: "#dc2626",
};

/* a hotspot can arrive as a bare string (back-compat) or a rich object */
export type Hotspot = {
  part: string;
  severity?: number | null;
  kind?: "injury" | "soreness";
};
type HotspotInput = string | Hotspot;

/* ---- severity → color ---- */
const SEV = {
  high: "#ef4444", // red
  mid: "#f59e0b", // amber
  low: "#eab308", // gold
};
function spotColor(h: Hotspot): string {
  if (h.kind === "injury") return SEV.high; // injuries always flag red
  const s = h.severity ?? 5;
  if (s >= 7) return SEV.high;
  if (s >= 4) return SEV.mid;
  return SEV.low;
}
/* glow radius grows with severity */
function spotSize(h: Hotspot): number {
  if (h.kind === "injury") return 30;
  const s = h.severity ?? 5;
  return 20 + Math.min(14, (s / 10) * 14);
}

/* ---- anatomy map — standing figure, coords symmetric about x=110 (220 × 320 viewBox) ---- */
type Region =
  | { name: string; lateral: true; l: [number, number]; r: [number, number] }
  | { name: string; lateral: false; c: [number, number] };
const REGIONS: { re: RegExp; r: Region }[] = [
  { re: /achilles|ankle/, r: { name: "Achilles", lateral: true, l: [100, 300], r: [120, 300] } },
  { re: /heel|plantar|arch/, r: { name: "Heel", lateral: true, l: [104, 313], r: [116, 313] } },
  { re: /foot|toe|feet/, r: { name: "Foot", lateral: true, l: [103, 314], r: [117, 314] } },
  { re: /shin|tibia|tibial/, r: { name: "Shin", lateral: true, l: [99, 282], r: [121, 282] } },
  { re: /calf|calves|soleus/, r: { name: "Calf", lateral: true, l: [95, 275], r: [125, 275] } },
  { re: /knee|patella|acl|mcl|meniscus/, r: { name: "Knee", lateral: true, l: [99, 250], r: [121, 250] } },
  { re: /hamstring|thigh|quad|adductor|femoris/, r: { name: "Thigh", lateral: true, l: [98, 212], r: [122, 212] } },
  { re: /groin|pubic/, r: { name: "Groin", lateral: false, c: [110, 186] } },
  { re: /it ?band|hip|glute|flexor/, r: { name: "Hip / IT band", lateral: true, l: [92, 180], r: [128, 180] } },
  { re: /lower ?back|lumbar|spine|si ?joint/, r: { name: "Lower back", lateral: false, c: [110, 150] } },
  { re: /back|lat\b|erector/, r: { name: "Back", lateral: false, c: [110, 112] } },
  { re: /abs|core|stomach|oblique|abdom/, r: { name: "Core", lateral: false, c: [110, 126] } },
  { re: /chest|pec|sternum/, r: { name: "Chest", lateral: true, l: [99, 96], r: [121, 96] } },
  { re: /shoulder|delt|rotator|clavicle|trap|labrum/, r: { name: "Shoulder", lateral: true, l: [84, 80], r: [136, 80] } },
  { re: /forearm|wrist|elbow/, r: { name: "Forearm", lateral: true, l: [68, 165], r: [152, 165] } },
  { re: /bicep|tricep|\barm\b|upper arm/, r: { name: "Arm", lateral: true, l: [71, 118], r: [149, 118] } },
  { re: /hand|finger|thumb/, r: { name: "Hand", lateral: true, l: [76, 200], r: [144, 200] } },
  { re: /neck|throat|cervical/, r: { name: "Neck", lateral: false, c: [110, 50] } },
  { re: /head|skull|jaw|concussion/, r: { name: "Head", lateral: false, c: [110, 28] } },
];

type Placed = { x: number; y: number; label: string; color: string; size: number; injury: boolean };

/* turn a raw part string + meta into 1–2 placed, positioned dots */
function place(h: Hotspot): Placed[] {
  const raw = h.part ?? "";
  const s = raw.toLowerCase();
  const match = REGIONS.find((z) => z.re.test(s));
  const region: Region = match?.r ?? { name: raw || "Area", lateral: true, l: [92, 178], r: [128, 164] };
  const color = spotColor(h);
  const size = spotSize(h);
  const injury = h.kind === "injury";

  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const at = (xy: [number, number], side: "left" | "right" | null): Placed => ({
    x: xy[0],
    y: xy[1],
    label: side ? `${cap(side)} ${region.name.toLowerCase()}` : region.name,
    color,
    size,
    injury,
  });

  if (!region.lateral) return [at(region.c, null)];

  const hasLeft = /left|\(l\)|\bl\b/.test(s);
  const hasRight = /right|\(r\)|\br\b/.test(s);
  const both = /both|bilateral/.test(s);
  if (both || (hasLeft && hasRight)) return [at(region.l, "left"), at(region.r, "right")];
  if (hasLeft) return [at(region.l, "left")];
  if (hasRight) return [at(region.r, "right")];
  return [at(region.l, "left"), at(region.r, "right")]; // no side on a lateral part → both
}

/* ---- athlete figure — standing, volumetrically shaded body (light from upper-left) ---- */
function Figure({ id }: { id: string }) {
  const bodyHalf =
    "M110 44 Q100 50 90 62 Q80 70 74 80 Q80 93 85 100 Q91 124 93 150 " +
    "Q94 172 87 182 Q90 202 96 232 Q98 242 98 250 Q96 262 94 272 " +
    "Q95 289 101 300 Q101 308 100 314 Q104 318 110 317 Q108 315 106 314 " +
    "Q105 307 105 300 Q106 286 108 272 Q106 260 105 250 Q105 226 107 205 " +
    "Q108 196 108 191 L110 189 L110 44 Z";
  const armHalf =
    "M74 80 Q66 94 66 116 Q65 138 68 158 Q70 176 73 191 Q69 196 71 202 " +
    "Q74 208 79 206 Q84 205 83 198 Q83 193 81 190 Q80 174 80 158 " +
    "Q79 138 82 116 Q83 104 85 100 Q80 90 74 80 Z";
  const mir = "translate(220,0) scale(-1,1)";
  const sil = (
    <>
      <path d={bodyHalf} />
      <path d={bodyHalf} transform={mir} />
      <path d={armHalf} />
      <path d={armHalf} transform={mir} />
      <ellipse cx="110" cy="28" rx="13" ry="16" />
      <path d="M104 42 L116 42 L115 55 Q110 57 105 55 Z" />
    </>
  );

  return (
    <svg viewBox="0 0 220 320" width="100%" height="100%" aria-hidden preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`am-base-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7c96a" />
          <stop offset="45%" stopColor="#eda12f" />
          <stop offset="100%" stopColor="#cf6c24" />
        </linearGradient>
        {/* cylindrical roundness: dark edges, lit centre-left */}
        <linearGradient id={`am-round-${id}`} x1="60" y1="0" x2="160" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4a1905" stopOpacity="0.55" />
          <stop offset="22%" stopColor="#7c2d12" stopOpacity="0" />
          <stop offset="42%" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="70%" stopColor="#7c2d12" stopOpacity="0" />
          <stop offset="100%" stopColor="#4a1905" stopOpacity="0.6" />
        </linearGradient>
        <radialGradient id={`am-hl-${id}`}>
          <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`am-sh-${id}`}>
          <stop offset="0%" stopColor="#5a1e0a" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#5a1e0a" stopOpacity="0" />
        </radialGradient>
        <g id={`am-sil-${id}`}>{sil}</g>
        <clipPath id={`am-clip-${id}`}>{sil}</clipPath>
        <g id={`am-hls-${id}`}>
          <ellipse cx="98" cy="90" rx="12" ry="9" /><ellipse cx="122" cy="90" rx="12" ry="9" />
          <ellipse cx="81" cy="80" rx="8" ry="9" /><ellipse cx="139" cy="80" rx="8" ry="9" />
          <ellipse cx="103" cy="128" rx="6" ry="16" /><ellipse cx="117" cy="128" rx="6" ry="16" />
          <ellipse cx="99" cy="214" rx="8" ry="20" /><ellipse cx="121" cy="214" rx="8" ry="20" />
          <ellipse cx="97" cy="274" rx="6" ry="13" /><ellipse cx="123" cy="274" rx="6" ry="13" />
          <ellipse cx="71" cy="120" rx="6" ry="14" /><ellipse cx="149" cy="120" rx="6" ry="14" />
          <ellipse cx="106" cy="24" rx="7" ry="8" />
        </g>
        <g id={`am-shs-${id}`}>
          <ellipse cx="110" cy="118" rx="4" ry="30" />
          <ellipse cx="110" cy="250" rx="5" ry="30" />
          <ellipse cx="88" cy="150" rx="6" ry="18" /><ellipse cx="132" cy="150" rx="6" ry="18" />
        </g>
      </defs>

      {/* solid base body */}
      <g fill={`url(#am-base-${id})`}><use href={`#am-sil-${id}`} /></g>
      {/* shading, clipped to the body */}
      <g clipPath={`url(#am-clip-${id})`}>
        <g fill={`url(#am-sh-${id})`}><use href={`#am-shs-${id}`} /></g>
        <rect x="0" y="0" width="220" height="320" fill={`url(#am-round-${id})`} />
        <g fill={`url(#am-hl-${id})`}><use href={`#am-hls-${id}`} /></g>
      </g>

      {/* muscle-definition contours */}
      <g stroke="#7c2d12" strokeOpacity="0.30" strokeWidth="1.2" fill="none" strokeLinecap="round">
        <g id={`am-mus-${id}`}>
          <path d="M108 88 Q100 84 92 92 Q96 104 108 100" />
          <path d="M110 78 L110 150" strokeOpacity="0.14" />
          <path d="M109 116 Q104 117 100 116" /><path d="M109 128 Q104 129 100 128" /><path d="M109 140 Q105 141 101 140" />
          <path d="M93 150 Q100 160 110 162" strokeOpacity="0.22" />
          <path d="M98 196 Q101 220 99 248" />
          <path d="M95 262 Q99 274 96 288" />
          <path d="M78 78 Q86 82 90 92" strokeOpacity="0.28" />
          <path d="M70 106 Q73 124 72 142" strokeOpacity="0.22" />
        </g>
        <use href={`#am-mus-${id}`} transform={mir} />
      </g>

      {/* crisp outline */}
      <g fill="none" stroke="#9c4917" strokeOpacity="0.45" strokeWidth="1.1">
        <use href={`#am-sil-${id}`} />
      </g>
    </svg>
  );
}

export default function AthleteModel({
  readiness,
  zone,
  hotspots,
}: {
  readiness: number;
  zone: Zone;
  hotspots: HotspotInput[];
}) {
  const ambient = ZONE_COLOR[zone];

  const spots = useMemo<Placed[]>(() => {
    const norm: Hotspot[] = (hotspots ?? [])
      .map((h) => (typeof h === "string" ? { part: h, kind: "injury" as const } : h))
      .filter((h) => h.part && h.part.trim().length > 0);
    return norm.flatMap(place).slice(0, 6);
  }, [hotspots]);

  const zoneWord = zone === "ready" ? "Recovered" : zone === "caution" ? "Monitor" : "Elevated risk";

  const css = `
  .am-stage { perspective: 1100px; }
  .am-rot { transform-style: preserve-3d; animation: am-sway 8s ease-in-out infinite alternate; will-change: transform; }
  .am-bob { animation: am-bob 4.5s ease-in-out infinite; transform-style: preserve-3d; }
  .am-layer { position: absolute; inset: 0; }
  .am-ghost1 { transform: translateZ(-22px); filter: blur(2px); opacity: .12; }
  .am-front  { transform: translateZ(0); filter: drop-shadow(0 14px 20px rgba(180,83,9,0.22)); }

  /* glowing hotspot */
  .am-spot { position:absolute; margin-left:calc(var(--r) * -0.5px); margin-top:calc(var(--r) * -0.5px);
    width:calc(var(--r) * 1px); height:calc(var(--r) * 1px); }
  .am-bloom { position:absolute; inset:0; border-radius:999px;
    background: radial-gradient(circle, var(--c) 0%, color-mix(in oklab, var(--c) 55%, transparent) 40%, transparent 72%);
    filter: blur(1px); animation: am-breathe 2.4s ease-in-out infinite; }
  .am-core { position:absolute; top:50%; left:50%; width:9px; height:9px; margin:-4.5px 0 0 -4.5px;
    border-radius:999px; background:var(--c); box-shadow:0 0 10px 2px var(--c); }
  .am-ping { position:absolute; inset:0; border-radius:999px; border:2px solid var(--c);
    animation: am-ping 2s cubic-bezier(0,0,0.2,1) infinite; }
  .am-injury .am-core { border-radius:2px; transform:translate(-50%,-50%) rotate(45deg); top:50%; left:50%; margin:0; width:8px; height:8px; }

  /* scanning ring that sweeps up & down the body */
  .am-scanring { position:absolute; left:8%; right:8%; height:44px; margin-top:-22px; pointer-events:none;
    animation: am-scanring 4.2s ease-in-out infinite; }
  .am-scanring svg { width:100%; height:44px; overflow:visible; filter: drop-shadow(0 0 6px var(--zc)); }
  .am-ring { animation: am-spin 16s linear infinite; transform-origin:center; }

  @keyframes am-sway { from { transform: rotateY(-18deg); } to { transform: rotateY(18deg); } }
  @keyframes am-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  @keyframes am-breathe { 0%,100% { transform: scale(.9); opacity:.85; } 50% { transform: scale(1.12); opacity:1; } }
  @keyframes am-ping { 0% { transform:scale(.45); opacity:.85; } 80%,100% { transform:scale(1.7); opacity:0; } }
  @keyframes am-scanring { 0% { top:14%; } 50% { top:86%; } 100% { top:14%; } }
  @keyframes am-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .am-rot,.am-bob,.am-scanring,.am-ring,.am-ping,.am-bloom { animation: none !important; }
    .am-rot { transform: rotateY(-8deg); }
  }`;

  return (
    <div
      className="relative rounded-2xl border overflow-hidden"
      style={{
        borderColor: "var(--hairline)",
        background:
          "radial-gradient(120% 90% at 50% 6%, color-mix(in oklab, " +
          ambient +
          " 12%, var(--surface)) 0%, var(--surface) 68%)",
        minHeight: 384,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* header */}
      <div className="flex items-start justify-between px-5 pt-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--ink-muted)" }}>
            Body scan
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--ink-muted)" }}>
            {spots.length ? `${spots.length} area${spots.length > 1 ? "s" : ""} flagged` : "All clear"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
            Readiness
          </div>
          <div className="text-3xl font-extrabold tabular-nums leading-none" style={{ color: ambient }}>
            {readiness}
          </div>
          <div className="text-[10px] font-medium mt-0.5" style={{ color: ambient }}>
            {zoneWord}
          </div>
        </div>
      </div>

      {/* 3D stage */}
      <div className="am-stage relative" style={{ height: 300 }}>
        <div className="am-rot absolute inset-0 flex items-end justify-center">
          <div className="am-bob relative" style={{ width: 220, height: 300 }}>
            {/* depth-stacked figure */}
            <div className="am-layer am-ghost1"><Figure id="g1" /></div>
            <div className="am-layer am-front"><Figure id="fr" /></div>

            {/* scanning ring that sweeps up & down the body */}
            <div className="am-scanring" style={{ ["--zc" as string]: ambient }}>
              <svg viewBox="0 0 200 40" preserveAspectRatio="none">
                <ellipse cx="100" cy="20" rx="94" ry="15" fill="none" stroke={ambient} strokeOpacity="0.35" strokeWidth="1.5" />
                <path d="M6 20 A94 15 0 0 0 194 20" fill="none" stroke={ambient} strokeWidth="2.5" />
                <ellipse cx="100" cy="20" rx="94" ry="15" fill={ambient} fillOpacity="0.06" />
              </svg>
            </div>

            {/* glowing hotspots */}
            {spots.map((s, i) => (
              <span
                key={i}
                className={`am-spot${s.injury ? " am-injury" : ""}`}
                title={s.label}
                style={{
                  left: `${(s.x / 220) * 100}%`,
                  top: `${(s.y / 320) * 100}%`,
                  ["--c" as string]: s.color,
                  ["--r" as string]: s.size,
                }}
              >
                <span className="am-bloom" />
                <span className="am-ping" />
                <span className="am-core" />
              </span>
            ))}
          </div>
        </div>

        {/* holographic pedestal */}
        <div className="absolute left-1/2 bottom-5 -translate-x-1/2" style={{ perspective: 500 }}>
          <div style={{ width: 180, height: 54, transform: "rotateX(66deg)", transformStyle: "preserve-3d" }}>
            <svg viewBox="0 0 180 180" width="180" height="180" style={{ marginTop: -63 }} aria-hidden>
              <g className="am-ring" fill="none" stroke={ambient} strokeOpacity="0.5">
                <circle cx="90" cy="90" r="86" strokeDasharray="4 10" strokeWidth="2" />
                <circle cx="90" cy="90" r="60" strokeOpacity="0.3" strokeWidth="1.5" />
                <circle cx="90" cy="90" r="34" strokeOpacity="0.2" strokeWidth="1.5" />
              </g>
            </svg>
          </div>
        </div>
      </div>

      {/* legend */}
      <div className="px-5 pb-4 -mt-1">
        {spots.length ? (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs" style={{ color: "var(--ink-2)" }}>
              {spots.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }}
                  />
                  {s.label}
                  {s.injury && (
                    <span className="text-[10px] px-1 rounded" style={{ background: "color-mix(in oklab, #ef4444 18%, transparent)", color: "#ef4444" }}>
                      injury
                    </span>
                  )}
                </span>
              ))}
            </div>
            <div className="mt-2 text-[10px]" style={{ color: "var(--ink-muted)" }}>
              red = injury / severe · amber = moderate · gold = mild soreness
            </div>
          </>
        ) : (
          <div className="text-xs" style={{ color: "var(--ink-muted)" }}>
            No flagged areas — nothing lit up. Keep it that way.
          </div>
        )}
      </div>
    </div>
  );
}
