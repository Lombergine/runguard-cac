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
        background: `oklch(0.92 0.055 ${hue})`,
        color: `oklch(0.45 0.11 ${hue})`,
        border: `1px solid oklch(0.82 0.07 ${hue})`,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
