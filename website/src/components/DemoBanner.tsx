import Link from "next/link";

/**
 * The strip that says "you are looking at sample data, and nothing you do here
 * sticks".
 *
 * Rendered from a SERVER check (`isDemoSession()`), not from reading the cookie
 * in the browser. A client-side read would mean the banner appears a frame after
 * the page — so the first thing a coach sees is the roster with no context, and
 * then the layout jumps.
 *
 * Three things it has to do, in this order of importance:
 *
 *  1. Say the data is not real, before a coach forms an opinion about an athlete
 *     called Grace Chen. Getting feedback on a product is fine; getting feedback
 *     on what looks like a real injured minor is not.
 *  2. Say that edits will not save, BEFORE they try one. The refusal message on
 *     a failed save is honest but arrives too late to stop the moment of "is
 *     this thing broken?" that a demo cannot afford.
 *  3. Give the way out. A coach who likes it should be able to have their own
 *     team in one click from wherever they are standing.
 *
 * Not dismissible on purpose. A banner that can be closed is one a coach closes
 * in the first ten seconds and then spends the rest of the visit believing they
 * are looking at a real roster.
 */
export default function DemoBanner() {
  return (
    <div
      className="border-b"
      style={{
        borderColor: "color-mix(in oklab, var(--brand) 35%, transparent)",
        background: "color-mix(in oklab, var(--brand) 10%, var(--surface))",
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <span className="micro-label" style={{ color: "var(--brand-strong)" }}>
          Demo
        </span>
        <span style={{ color: "var(--ink-2)" }}>
          A sample team with made-up runners. Look anywhere. Nothing you change is saved.
        </span>
        <Link
          href="/signup"
          className="ml-auto rounded-full px-4 py-1.5 text-xs font-semibold text-black whitespace-nowrap"
          style={{ background: "var(--brand)" }}
        >
          Create your own team, free →
        </Link>
      </div>
    </div>
  );
}
