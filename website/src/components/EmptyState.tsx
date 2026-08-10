export function InsufficientData({
  label = "Not enough training history yet — sync more data or give it a couple of weeks.",
  height = 140,
}: {
  label?: string;
  height?: number;
}) {
  return (
    <div
      className="flex items-center justify-center text-center text-sm px-4"
      style={{ minHeight: height, color: "var(--ink-muted)" }}
    >
      {label}
    </div>
  );
}

/** True if at least `min` entries in `data` are "real" per `isPresent` (default: any entry counts). */
export function hasEnoughData<T>(
  data: T[] | undefined | null,
  min = 5,
  isPresent: (d: T) => boolean = () => true
): boolean {
  if (!Array.isArray(data)) return false;
  return data.filter(isPresent).length >= min;
}
