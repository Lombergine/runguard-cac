import Link from "next/link";
import WaitlistForm from "@/components/WaitlistForm";

export default function Landing() {
  return (
    <div className="flex-1">
      {/* nav — sticky, on the glass utility the design system already defines */}
      <header
        className="sticky top-0 z-40 glass border-b"
        style={{ borderColor: "var(--hairline)" }}
      >
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <span className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 20L4 9a2 2 0 012-2h12a2 2 0 012 2v11" stroke="var(--brand)" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M8 13l3 3 5-6" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            RunGuard
          </span>
          <nav className="flex items-center gap-4 text-sm" style={{ color: "var(--ink-2)" }}>
            <a href="#how" className="hover:opacity-70 hidden sm:inline">How it works</a>
            <a href="#pricing" className="hover:opacity-70 hidden sm:inline">Pricing</a>
            <Link href="/athlete/login" className="hover:opacity-70 font-medium hidden sm:inline">
              Athlete login
            </Link>
            <Link href="/login" className="hover:opacity-70 font-medium">
              Coach login
            </Link>
            <Link
              href="/signup"
              className="lift rounded-full px-4 py-1.5 font-semibold text-black"
              style={{ background: "var(--brand)" }}
            >
              Create team
            </Link>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="topo relative mx-auto max-w-6xl px-4 pt-20 pb-8 text-center glow-ember">
        <p className="enter micro-label" style={{ ["--i" as string]: 0 }}>
          Athlete monitoring for running teams
        </p>

        {/* Size and weight extremes rather than a timid 1.5x scale: 11px
            uppercase eyebrow → 84px display is the jump that makes a page read
            as designed instead of as a document. */}
        <h1
          className="enter mt-5 text-5xl sm:text-7xl lg:text-8xl font-extrabold max-w-4xl mx-auto"
          style={{ ["--i" as string]: 1, letterSpacing: "-0.04em", lineHeight: 0.95 }}
        >
          <span className="text-shine">See the injury coming</span>{" "}
          <span className="text-ember">before it happens.</span>
        </h1>

        <p
          className="enter mt-7 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed"
          style={{ ["--i" as string]: 2, color: "var(--ink-2)" }}
        >
          RunGuard syncs your athletes&apos; watches, tracks every runner&apos;s training
          load, and flags who&apos;s at risk — before practice even starts.
        </p>

        {/* One primary action. Three buttons at equal weight made a first
            visitor choose instead of click; the demos are still one click away. */}
        <div className="enter mt-9 flex justify-center" style={{ ["--i" as string]: 3 }}>
          <Link
            href="/signup"
            className="lift rounded-full px-8 py-4 text-base font-semibold text-black"
            style={{ background: "var(--ember)", boxShadow: "0 6px 28px rgba(245,158,11,0.32)" }}
          >
            Create your team — free →
          </Link>
        </div>
        <p className="enter mt-5 text-sm" style={{ ["--i" as string]: 4, color: "var(--ink-muted)" }}>
          Or look around first —{" "}
          <Link href="/login" className="underline underline-offset-4 hover:opacity-70" style={{ color: "var(--ink-2)" }}>
            coach demo
          </Link>
          {" · "}
          <Link href="/athlete/login" className="underline underline-offset-4 hover:opacity-70" style={{ color: "var(--ink-2)" }}>
            athlete demo
          </Link>
        </p>
      </section>

      {/* The page had no picture of the product anywhere — it was argument with
          nothing to look at. This is the roster a coach opens before practice,
          drawn in the app's own tokens and status colours. Replace it with a
          real screenshot the moment there's one worth showing. */}
      <section className="mx-auto max-w-4xl px-4 pb-24">
        <div
          className="enter card-ember rounded-3xl overflow-hidden"
          style={{ ["--i" as string]: 5, background: "var(--surface)" }}
        >
          <div
            className="flex items-center justify-between px-5 py-3 border-b"
            style={{ borderColor: "var(--hairline)", background: "var(--surface-2)" }}
          >
            <span className="micro-label" style={{ color: "var(--ink-2)" }}>Today&apos;s roster · 6:40 AM</span>
            <span className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--status-serious)" }}>
              <span
                className="dot-alert inline-block w-2 h-2 rounded-full"
                style={{ background: "var(--status-serious)" }}
                aria-hidden
              />
              2 flagged
            </span>
          </div>
          <ul>
            <RosterRow name="Maya Rodriguez" detail="Mileage +38% · HRV −21% · shin 7/10" status="serious" label="Sit out" load={92} />
            <RosterRow name="Ethan Park" detail="Returning from shin injury · load climbing" status="warning" label="Modify" load={68} />
            <RosterRow name="Grace Chen" detail="Steady 4 weeks · sleep 7h50m avg" status="good" label="Clear" load={41} />
            <RosterRow name="Chris Okafor" detail="Undertrained · can absorb more work" status="good" label="Clear" load={26} last />
          </ul>
        </div>
        <p className="mt-4 text-center text-xs" style={{ color: "var(--ink-muted)" }}>
          Illustration of the coach dashboard. Every figure is computed from the athlete&apos;s own watch data.
        </p>
      </section>

      {/* problem stats — the one dark band on the page. An evenly cream page
          gives the eye nowhere to land; committing one section to ink makes
          these three numbers the thing you remember. */}
      <section style={{ background: "var(--ink)" }}>
        <div className="mx-auto max-w-6xl px-4 py-20">
          <p className="micro-label text-center" style={{ color: "rgba(255,255,255,0.45)" }}>
            Why this exists
          </p>
          <div className="mt-10 grid sm:grid-cols-3 gap-10 sm:gap-8 text-center">
            <Stat n="1.5M" body="high schoolers run track & cross country every year" />
            <Stat n="38%" body="get injured every single season" />
            <Stat n="60–70%" body="of those injuries trace back to training errors coaches can't see" />
          </div>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-24">
        <p className="micro-label text-center">How it works</p>
        <h2
          className="mt-4 text-4xl sm:text-5xl font-extrabold text-center max-w-3xl mx-auto"
          style={{ letterSpacing: "-0.03em", lineHeight: 1.05 }}
        >
          One coach. Forty athletes. Zero blind spots.
        </h2>
        <div className="mt-14 grid md:grid-cols-3 gap-4">
          <Step
            n="1"
            title="Athletes sync automatically"
            body="Runs flow in from Apple Health the moment a workout ends — Apple Watch, Garmin, anything that writes to it. No spreadsheets, no asking kids to log anything."
          />
          <Step
            n="2"
            title="RunGuard does the math"
            body="Every athlete's acute and chronic training load, mileage ramps, monotony, and recovery — recalculated after every single run."
          />
          <Step
            n="3"
            title="You get flagged, not surprised"
            body="Open the dashboard before practice and see exactly who's in the danger zone and why — in plain English, not sports-science jargon."
          />
        </div>
      </section>

      {/* both sides */}
      <section className="mx-auto max-w-6xl px-4 pb-24 grid md:grid-cols-2 gap-4">
        <div className="lift rounded-2xl border p-8" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
          <p className="micro-label">For coaches</p>
          <h3 className="mt-3 font-bold text-2xl" style={{ letterSpacing: "-0.02em" }}>
            Triage a roster in five minutes
          </h3>
          <ul className="mt-6 space-y-3 text-sm" style={{ color: "var(--ink-2)" }}>
            <Li>Risk-ranked roster before every practice</Li>
            <Li>Auto-grouping by fitness and recovery status</Li>
            <Li>Catch the 40% mileage jump a kid did on their own</Li>
            <Li>Every athlete&apos;s trends without asking a single question</Li>
          </ul>
        </div>
        <div className="lift rounded-2xl border p-8" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
          <p className="micro-label">For athletes</p>
          <h3 className="mt-3 font-bold text-2xl" style={{ letterSpacing: "-0.02em" }}>
            Know what your own data says
          </h3>
          <ul className="mt-6 space-y-3 text-sm" style={{ color: "var(--ink-2)" }}>
            <Li>Sign up on your own — no coach or team required</Li>
            <Li>Your readiness score, weekly plan, and race predictions</Li>
            <Li>An AI assistant that actually knows your training</Li>
            <Li>iPhone app with live Apple Health sync · join a team anytime</Li>
            <Li>Android support lands after the iOS launch</Li>
          </ul>
          <Link
            href="/athlete/signup"
            className="lift inline-block mt-7 rounded-full px-5 py-2.5 text-sm font-semibold text-black"
            style={{ background: "var(--brand)" }}
          >
            Create your account →
          </Link>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="border-t" style={{ borderColor: "var(--hairline)" }}>
        <div className="mx-auto max-w-6xl px-4 py-24">
          <p className="micro-label text-center">Pricing</p>
          <h2
            className="mt-4 text-4xl sm:text-5xl font-extrabold text-center"
            style={{ letterSpacing: "-0.03em" }}
          >
            Free for every team
          </h2>
          <p className="mt-5 text-center text-base max-w-xl mx-auto" style={{ color: "var(--ink-2)" }}>
            No district procurement, no per-seat negotiation, no annual contract, no card.
          </p>
          {/* One offer, one number. A pricing table with a single free tier reads
              as more confident than a grid of options, and there is nothing to
              compare against — so the card is centered and the number leads. */}
          <div className="mt-14 max-w-md mx-auto">
            <div
              className="lift card-ember rounded-2xl p-8 text-center"
              style={{ background: "var(--surface)" }}
            >
              <p className="micro-label" style={{ color: "var(--brand-strong)" }}>For teams</p>
              <div className="mt-4 flex items-baseline justify-center gap-1.5">
                <span className="text-7xl font-extrabold num" style={{ letterSpacing: "-0.04em" }}>$0</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                The full coach dashboard for your whole roster. Unlimited athletes, every
                athlete&apos;s app included. Free while we onboard our first teams.
              </p>
              <Link
                href="/signup"
                className="lift inline-block mt-7 rounded-full px-6 py-3 text-sm font-semibold text-black"
                style={{ background: "var(--ember)", boxShadow: "0 4px 20px rgba(245,158,11,0.28)" }}
              >
                Create your account →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* waitlist */}
      <section id="waitlist" className="border-t" style={{ borderColor: "var(--hairline)", background: "var(--surface-2)" }}>
        <div className="mx-auto max-w-xl px-4 py-24 text-center">
          <h2 className="text-4xl sm:text-5xl font-extrabold" style={{ letterSpacing: "-0.03em" }}>
            Get early access
          </h2>
          <p className="mt-4 text-base" style={{ color: "var(--ink-2)" }}>
            We&apos;re onboarding teams for this season. Coaches and athletes welcome.
          </p>
          <WaitlistForm />
        </div>
      </section>

      {/* A footer with nothing but a copyright reads as unfinished. The two
          things that signal a real product here are a reachable privacy policy
          — that page already existed and was linked from nowhere — and an
          explicit statement of what this tool is not. For something that reads
          minors' health data and talks about injury, the disclaimer is both the
          more professional choice and the honest one: it matches how the engine
          is framed everywhere else in the codebase. */}
      <footer className="border-t" style={{ borderColor: "var(--hairline)" }}>
        <div className="mx-auto max-w-6xl px-4 py-12 text-xs" style={{ color: "var(--ink-muted)" }}>
          <div className="flex flex-wrap gap-x-8 gap-y-3 justify-between items-center">
            <span>© {new Date().getFullYear()} RunGuard · Injury prevention for high school running teams</span>
            <nav className="flex flex-wrap gap-x-5 gap-y-2">
              <a href="#how" className="hover:opacity-70">How it works</a>
              <a href="#pricing" className="hover:opacity-70">Pricing</a>
              <Link href="/privacy" className="hover:opacity-70">Privacy</Link>
            </nav>
          </div>
          <p className="mt-8 max-w-3xl leading-relaxed">
            RunGuard monitors training load and recovery. It is not a medical device, it
            does not diagnose injury, and it is not a substitute for a physician, an
            athletic trainer, or a coach&apos;s judgement.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Stat({ n, body }: { n: string; body: string }) {
  return (
    <div>
      <div
        className="text-5xl sm:text-6xl font-extrabold text-ember num"
        style={{ letterSpacing: "-0.04em" }}
      >
        {n}
      </div>
      <p className="mt-3 text-sm leading-relaxed mx-auto max-w-[26ch]" style={{ color: "rgba(255,255,255,0.62)" }}>
        {body}
      </p>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
};

/* Explicit tints rather than color-mix(currentColor …) so the chips render the
   same on older Safari as they do on current. */
const STATUS_TINT: Record<string, string> = {
  good: "rgba(22, 163, 74, 0.11)",
  warning: "rgba(217, 119, 6, 0.12)",
  serious: "rgba(234, 88, 12, 0.12)",
};

function RosterRow({
  name,
  detail,
  status,
  label,
  load,
  last,
}: {
  name: string;
  detail: string;
  status: "good" | "warning" | "serious";
  label: string;
  load: number;
  last?: boolean;
}) {
  const color = STATUS_COLOR[status];
  return (
    <li
      className="flex items-center gap-4 px-5 py-4"
      style={{ borderBottom: last ? "none" : "1px solid var(--hairline)" }}
    >
      <span
        className="w-1.5 h-9 rounded-full shrink-0"
        style={{ background: color }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-semibold truncate">{name}</span>
        <span className="block text-xs truncate" style={{ color: "var(--ink-muted)" }}>{detail}</span>
      </span>
      <span className="hidden sm:block w-28 shrink-0" aria-hidden>
        <span className="block h-1.5 rounded-full" style={{ background: "var(--surface-3)" }}>
          <span className="bar-fill block h-1.5 rounded-full" style={{ width: `${load}%`, background: color }} />
        </span>
      </span>
      <span
        className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
        style={{ color, background: STATUS_TINT[status] }}
      >
        {label}
      </span>
    </li>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="lift rounded-2xl border p-7" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-black"
        style={{ background: "var(--ember)" }}
      >
        {n}
      </div>
      <h3 className="mt-5 font-bold text-lg" style={{ letterSpacing: "-0.015em" }}>{title}</h3>
      <p className="mt-2.5 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {body}
      </p>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 items-start">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0" aria-hidden>
        <path d="M5 13l4 4L19 7" stroke="var(--status-good)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </li>
  );
}
