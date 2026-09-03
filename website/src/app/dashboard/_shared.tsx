/**
 * The presentational pieces the coach's two dashboard tabs share.
 *
 * `/dashboard` (the team overview) and `/dashboard/roster` (the athlete list)
 * were one page until the roster grew past a screen and the team-level numbers
 * ended up buried under fourteen rows of it. Splitting them meant `Tile` and
 * the roster's flag vocabulary now have two callers, and a copy in each file is
 * how the two tabs would start disagreeing about what a flag means.
 *
 * These moved here verbatim, comments included — the reasoning in `RosterFlags`
 * about why the empty state is the word `clear` and not an em dash is the kind
 * that has to travel with the code it explains.
 */
import Link from "next/link";
import { miNum } from "@/lib/units";
import { STALE_AFTER_DAYS } from "@/lib/roster";
import { type RiskSnapshot, type SessionSpike } from "@/lib/risk";

/**
 * Everything on this row a coach could act on today — and nothing they can't.
 *
 * There is no score here by design. A ranked injury number taught athletes to
 * inflate their check-ins to stay off the top of it, which corrupted the most
 * sensitive signal in the system. These are specific, named, and tied either to
 * a session that already happened or to a pattern in what the athlete reported.
 *
 * A blank cell means nothing needs attention — not that the athlete is fine.
 * That distinction is why "no check-in" is itself one of the states.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE EMPTY STATE IS NO LONGER AN EM DASH
 *
 * It used to render "—", and that is the one glyph this product cannot spend
 * here. Everywhere else in RunGuard a dash means WE DO NOT KNOW:
 * ../../../../docs/visual-spec.md makes it a non-negotiable ("a blank must
 * never read as a healthy value"), the athlete app renders unknown readiness as
 * "— unknown", and the coach's OWN athlete detail page one directory over
 * prints "—" for an ACWR or a fitness score it has no data for.
 *
 * On this row it meant the opposite: nothing flagged, i.e. the good case. So
 * the roster taught a coach that a dash is reassuring, and the detail page then
 * showed them a dash that meant the figure was missing. Same mark, opposite
 * readings, two clicks apart, on the screen where "who do I not know about"
 * is the entire question.
 *
 * So the empty state says `clear`, which is not a euphemism but this product's
 * own vocabulary for it — the spec's advisory set is `clear` / `watch` /
 * `unusual` / `unknown`, and the athlete app's Advisory renders the same word.
 * It is honest here specifically because the no-data cases below never reach
 * it: an athlete with no check-ins, or a stale one, has already pushed a row,
 * so `clear` can only be reached when there IS recent self-report and nothing
 * in it needed a look. Lowercase, body weight, muted — § "Status and advisory"
 * forbids making a verdict louder than the description it sits in.
 *
 * The two no-check-in states additionally take the DASHED treatment, which is
 * what § "Coach dashboard" means by "absent check-ins rendered with the same
 * dashed treatment as the athlete app so *unknown* reads identically on both
 * sides". Dashed is now the only thing on this screen that means unknown, and
 * it means it on both sides of the product.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function RosterFlags({
  self,
  spike,
  daysSinceCheckIn,
  windowDays,
}: {
  self: RiskSnapshot["selfReport"];
  spike: SessionSpike | null;
  /** Days since the last check-in carrying a self-report; null = none in window. */
  daysSinceCheckIn: number | null;
  /** How far back `daysSinceCheckIn` actually looked, for the null case. */
  windowDays: number;
}) {
  const persistent = self.persistentPart && self.persistentDays >= 3;
  const acute = !persistent && self.todayMax >= 6;
  const stale = daysSinceCheckIn !== null && daysSinceCheckIn >= STALE_AFTER_DAYS;

  // `absent` marks the rows that mean "we don't know", which are the only ones
  // that get the dashed chip. A spike or a soreness pattern is something we DO
  // know, however unwelcome, so it stays plain coloured text.
  const rows: { text: string; color: string; title?: string; absent?: boolean }[] = [];

  if (spike) {
    rows.push({
      text: `\u26a0 ${miNum(spike.km)} mi run · ${spike.pctAbove}% over usual`,
      color: spike.level === "large" ? "var(--status-critical)" : "var(--status-warning)",
      title: `Longest run in the 30 days before it was ${miNum(spike.longestKm)} mi`,
    });
  }
  if (persistent) {
    rows.push({
      text: `\u26a0 ${self.persistentPart} · ${self.persistentDays}/7d${self.escalating ? " \u2191" : ""}`,
      color: "var(--status-warning)",
      title: `Reported sore on ${self.persistentDays} of the last 7 days, peak ${self.persistentPeak}/10`,
    });
  } else if (acute) {
    rows.push({
      text: `\u26a0 ${self.todayPart} · ${self.todayMax}/10 today`,
      color: "var(--status-critical)",
    });
  }
  if (daysSinceCheckIn === null) {
    // Bounded, not absolute. The query only looked back `windowDays`, so this
    // says what was actually measured rather than claiming "never".
    rows.push({
      text: `no check-in in ${windowDays}d`,
      color: "var(--ink-2)",
      absent: true,
    });
  } else if (stale) {
    rows.push({
      text: `no check-in · ${daysSinceCheckIn}d`,
      color: "var(--ink-2)",
      absent: true,
    });
  }

  // Reachable only with recent self-report and nothing flagged in it — see the
  // header. Never the no-data case, which pushed its own row above.
  if (!rows.length) {
    return (
      <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
        clear
      </span>
    );
  }

  return (
    <div className="space-y-0.5">
      {rows.map((r, i) =>
        r.absent ? (
          // The athlete app's Absent, at roster scale: dashed border, sunken
          // fill, and a label naming what is missing. `ink-2` rather than
          // `ink-muted`, because the chip moves this text off `surface` onto
          // `surface-2`, where ink-muted #94897b measures 2.99:1 — under the
          // 4.5:1 floor, on the one thing in the row a coach is meant to act
          // on. ink-2 #55503f is 7.04:1 on the same fill.
          <div
            key={i}
            className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium"
            style={{
              color: r.color,
              border: "1px dashed var(--hairline-strong)",
              background: "var(--surface-2)",
            }}
            title={r.title}
          >
            {r.text}
          </div>
        ) : (
          <div
            key={i}
            className="text-[11px] font-medium"
            style={{ color: r.color }}
            title={r.title}
          >
            {r.text}
          </div>
        )
      )}
    </div>
  );
}

/**
 * What the team is doing today, per the coach's own calendar.
 *
 * Shows nothing invented. With no session written it says so and links to the
 * calendar, rather than displaying RunGuard's generated suggestion here — that
 * suggestion is per-athlete by design, so there is no single team answer to
 * print, and printing one athlete's would be misleading on a team screen.
 */
export function TodaysSession({
  today,
  tomorrow,
}: {
  today: { type: string; distance_m: number | null; target_pace: string | null; details: string | null } | null;
  tomorrow: { type: string; distance_m: number | null } | null;
}) {
  const line = (d: { type: string; distance_m: number | null; target_pace?: string | null }) =>
    [d.type, d.distance_m != null ? `${miNum(d.distance_m / 1000)} mi` : null, d.target_pace]
      .filter(Boolean)
      .join(" · ");

  if (!today && !tomorrow) {
    return (
      <div
        className="rounded-2xl border p-5 flex flex-wrap items-center gap-x-4 gap-y-2"
        style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
      >
        <div className="flex-1 min-w-60">
          <div className="text-sm font-semibold">No session on the calendar today</div>
          <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
            Athletes are seeing RunGuard&apos;s own suggestion, adapted to each of them.
            Write your own and it replaces it for the whole team.
          </p>
        </div>
        <Link
          href="/dashboard/plan"
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-black"
          style={{ background: "var(--brand)" }}
        >
          Open the training calendar →
        </Link>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border p-5"
      style={{
        borderColor: "var(--brand)",
        background: "color-mix(in oklab, var(--brand) 6%, var(--surface))",
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="micro-label" style={{ color: "var(--brand-strong)" }}>
          Today&apos;s session
        </div>
        <Link href="/dashboard/plan" className="text-xs hover:underline" style={{ color: "var(--brand-strong)" }}>
          Edit the calendar →
        </Link>
      </div>
      <div className="text-xl font-bold mt-1">
        {today ? line(today) : "Nothing written for today"}
      </div>
      {today?.details && (
        <p className="text-sm mt-1.5 leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {today.details}
        </p>
      )}
      {tomorrow && (
        <p className="text-xs mt-2.5" style={{ color: "var(--ink-muted)" }}>
          Tomorrow: {line(tomorrow)}
        </p>
      )}
    </div>
  );
}

export function Tile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}
    >
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
        {label}
      </div>
      <div className="text-3xl font-bold mt-1" style={{ color: accent ?? "var(--ink)" }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: "var(--ink-muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
