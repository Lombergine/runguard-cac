import Link from "next/link";
import WaitlistForm from "@/components/WaitlistForm";

export default function Landing() {
  return (
    <div className="flex-1">
      {/* nav */}
      <header className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
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
            className="rounded-full px-4 py-1.5 font-semibold text-black hover:opacity-90"
            style={{ background: "var(--brand)" }}
          >
            Create team
          </Link>
        </nav>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-20 text-center glow-ember">
        <p
          className="enter inline-block text-xs font-medium rounded-full border px-3 py-1 mb-6"
          style={{ ["--i" as string]: 0, borderColor: "var(--hairline)", color: "var(--brand-strong)", background: "rgba(245,158,11,0.06)" }}
        >
          Built by a varsity XC captain who watched teammates get hurt every season
        </p>
        <h1
          className="enter text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05] max-w-3xl mx-auto"
          style={{ ["--i" as string]: 1, letterSpacing: "-0.025em" }}
        >
          <span className="text-shine">See the injury coming</span>{" "}
          <span className="text-ember">before it happens.</span>
        </h1>
        <p className="enter mt-6 text-lg max-w-2xl mx-auto" style={{ ["--i" as string]: 2, color: "var(--ink-2)" }}>
          RunGuard syncs your athletes&apos; watches, tracks every runner&apos;s training
          load, and flags who&apos;s at risk — before practice even starts.
        </p>
        <div className="enter mt-8 flex flex-col sm:flex-row items-center justify-center gap-3" style={{ ["--i" as string]: 3 }}>
          <Link
            href="/signup"
            className="lift rounded-full px-6 py-3 text-sm font-semibold text-black"
            style={{ background: "var(--ember)", boxShadow: "0 4px 20px rgba(245,158,11,0.28)" }}
          >
            Create your team — free →
          </Link>
          <Link
            href="/login"
            className="lift rounded-full border px-6 py-3 text-sm font-medium"
            style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
          >
            Coach demo
          </Link>
          <Link
            href="/athlete/login"
            className="lift rounded-full border px-6 py-3 text-sm font-medium"
            style={{ borderColor: "var(--hairline)", color: "var(--ink-2)" }}
          >
            Athlete demo
          </Link>
        </div>
      </section>

      {/* problem stats */}
      <section className="border-y" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
        <div className="mx-auto max-w-6xl px-4 py-12 grid sm:grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-4xl font-extrabold text-ember">1.5M</div>
            <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
              high schoolers run track &amp; cross country every year
            </p>
          </div>
          <div>
            <div className="text-4xl font-extrabold text-ember">38%</div>
            <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
              get injured every single season
            </p>
          </div>
          <div>
            <div className="text-4xl font-extrabold text-ember">60–70%</div>
            <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
              of those injuries trace back to training errors coaches can&apos;t see
            </p>
          </div>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-3xl font-bold tracking-tight text-center">
          One coach. Forty athletes. Zero blind spots.
        </h2>
        <div className="mt-12 grid md:grid-cols-3 gap-4">
          <Step
            n="1"
            title="Athletes sync automatically"
            body="Runs flow in from Strava, Garmin, and Apple Watch the moment a workout ends. No spreadsheets, no asking kids to log anything."
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
      <section className="mx-auto max-w-6xl px-4 pb-20 grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border p-8" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
          <h3 className="font-bold text-lg">For coaches</h3>
          <ul className="mt-4 space-y-3 text-sm" style={{ color: "var(--ink-2)" }}>
            <Li>Risk-ranked roster before every practice</Li>
            <Li>Auto-grouping by fitness and recovery status</Li>
            <Li>Catch the 40% mileage jump a kid did on their own</Li>
            <Li>Every athlete&apos;s trends without asking a single question</Li>
          </ul>
        </div>
        <div className="rounded-2xl border p-8" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
          <h3 className="font-bold text-lg">For athletes</h3>
          <ul className="mt-4 space-y-3 text-sm" style={{ color: "var(--ink-2)" }}>
            <Li>Sign up on your own — no coach or team required</Li>
            <Li>Your readiness score, weekly plan, and race predictions</Li>
            <Li>An AI assistant that actually knows your training</Li>
            <Li>iPhone app with live Apple Health sync · join a team anytime</Li>
          </ul>
          <Link
            href="/athlete/signup"
            className="inline-block mt-5 rounded-full px-5 py-2 text-sm font-semibold text-black"
            style={{ background: "var(--brand)" }}
          >
            Create your account →
          </Link>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="border-t" style={{ borderColor: "var(--hairline)" }}>
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl font-bold tracking-tight text-center">Simple pricing</h2>
          <div className="mt-10 grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--brand)", background: "var(--surface)" }}>
              <div className="text-sm font-medium" style={{ color: "var(--brand-strong)" }}>Teams</div>
              <div className="text-4xl font-extrabold mt-2">$100<span className="text-base font-medium" style={{ color: "var(--ink-muted)" }}>/mo</span></div>
              <p className="mt-3 text-sm" style={{ color: "var(--ink-2)" }}>
                Full coach dashboard for your whole roster. Unlimited athletes.
              </p>
            </div>
            <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
              <div className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>Athletes</div>
              <div className="text-4xl font-extrabold mt-2">$10<span className="text-base font-medium" style={{ color: "var(--ink-muted)" }}>/mo</span></div>
              <p className="mt-3 text-sm" style={{ color: "var(--ink-2)" }}>
                Personal trends, recovery tracking, and training insights.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* waitlist */}
      <section id="waitlist" className="border-t" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Get early access</h2>
          <p className="mt-3 text-sm" style={{ color: "var(--ink-2)" }}>
            We&apos;re onboarding teams for this season. Coaches and athletes welcome.
          </p>
          <WaitlistForm />
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-10 text-xs flex flex-wrap gap-4 justify-between" style={{ color: "var(--ink-muted)" }}>
        <span>© {new Date().getFullYear()} RunGuard</span>
        <span>Injury prevention for high school running teams</span>
      </footer>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl border p-6" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-black"
        style={{ background: "var(--brand)" }}
      >
        {n}
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
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
