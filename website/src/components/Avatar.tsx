export default function Avatar({
  name,
  hue,
  size = 36,
}: {
  name: string;
  hue: number;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold select-none shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        /*
          Lightness and chroma come from tokens so the same hue works on both
          themes. Hardcoded, the fill was a fixed `oklch(0.92 ...)` pastel that
          stayed a pale disc on a near-black page — bright enough to pull the
          eye to the least important element on the screen. The dark theme
          inverts the relationship: a dim tinted fill under bright tinted text.
        */
        background: `oklch(var(--avatar-bg-l) var(--avatar-bg-c) ${hue})`,
        color: `oklch(var(--avatar-fg-l) var(--avatar-fg-c) ${hue})`,
        border: `1px solid oklch(var(--avatar-border-l) var(--avatar-border-c) ${hue})`,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
