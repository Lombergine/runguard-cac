import Link from "next/link";

export const metadata = {
  title: "Privacy Policy · RunGuard",
  description: "How RunGuard collects, uses, and protects your data.",
};

// Update this to your real support address before submitting to the App Store.
const CONTACT_EMAIL = "gargaditya061@gmail.com";
const EFFECTIVE_DATE = "August 1, 2026";

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-bold tracking-tight mt-8 mb-3" style={{ color: "var(--ink)" }}>
      {children}
    </h2>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] leading-relaxed mb-3" style={{ color: "var(--ink-2)" }}>
      {children}
    </p>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--page, var(--surface))" }}>
      <main className="mx-auto max-w-3xl px-5 py-12">
        <Link href="/" className="text-sm hover:underline" style={{ color: "var(--ink-muted)" }}>
          ← RunGuard
        </Link>
        <h1 className="text-3xl font-bold tracking-tight mt-4 mb-1">RunGuard Privacy Policy</h1>
        <p className="text-sm mb-6" style={{ color: "var(--ink-muted)" }}>
          Effective date: {EFFECTIVE_DATE}
        </p>

        <P>
          RunGuard (&ldquo;RunGuard,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) is an injury-prevention
          tool for runners. It reads training and recovery data, computes an injury-risk score, and shares
          that score with the athlete and their coach. This policy explains what we collect, how we use it,
          who we share it with, and the choices you have. It applies to the RunGuard iOS app and the RunGuard
          web dashboard. Many RunGuard athletes are minors — please read the <strong>Minors</strong> section
          carefully. Questions? Email <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--brand-strong)" }}>{CONTACT_EMAIL}</a>.
        </P>

        <H2>Information we collect</H2>
        <P>
          <strong>Account information:</strong> name, email and password (stored only as a hash), team/school
          name, grade/class year, the events you run, and a pairing token that links your iOS app to your account.
        </P>
        <P>
          <strong>Apple Health (HealthKit) data</strong>, only with your explicit permission: running and related
          workouts (start time, duration, distance, average and maximum heart rate, active calories, cadence);
          daily recovery metrics (resting heart rate, heart-rate variability, sleep duration and stages, VO₂max,
          respiratory rate, blood oxygen, wrist temperature); and, when a workout has a GPS track, the route
          (latitude/longitude points) so your activity map can show where you ran. You can change or revoke this
          access at any time in iOS Settings → Privacy &amp; Security → Health → RunGuard.
        </P>
        <P>
          <strong>Self-reported check-ins</strong> (optional): session effort (RPE), soreness location and
          severity, energy, motivation, and whether you&rsquo;re under academic stress.
        </P>
        <P>
          <strong>Strava data</strong>, only if you connect Strava: recent activities, including distance,
          duration, heart rate, and the GPS route. You authorize this through Strava and can disconnect anytime.
        </P>
        <P>
          <strong>AI chat messages</strong>, only if the optional AI coaching chat is enabled: the messages you
          type and the training context needed to answer them may be sent to our AI provider (Anthropic) to
          generate a response.
        </P>
        <P>
          We do <strong>not</strong> collect payment information, and RunGuard does not use third-party
          advertising or cross-app tracking SDKs.
        </P>

        <H2>How we use your information</H2>
        <P>
          We use your information only to provide and improve RunGuard: to compute your training load and
          injury-risk score, to show you your readiness, plan, mileage, activity maps, and history, to show your
          coach the same information for the athletes on their team, to answer the coaching chat, and to secure
          and troubleshoot the service.
        </P>
        <P>
          <strong>Health-data commitments.</strong> Consistent with Apple&rsquo;s HealthKit requirements, health
          and recovery data is <strong>never</strong> used for advertising or marketing, <strong>never</strong>{" "}
          sold, and <strong>never</strong> shared with third parties such as data brokers. It is used only to
          provide the RunGuard injury-prevention service to you and your coach as described here.
        </P>

        <H2>How your information is shared</H2>
        <P>
          We share information only as needed to run the service: with your coach (your risk score, training
          history, activity maps, and check-ins are visible to the coach of your team — this is the core purpose
          of the product); with the service providers that host and operate RunGuard on our behalf (below); for
          legal reasons if required; and as part of a business transfer subject to this policy. We do not sell
          your personal information or health data, and we do not share it with data brokers or advertisers.
        </P>

        <H2>Service providers we use</H2>
        <P>
          <strong>Supabase</strong> (database storage, authentication, backend hosting); <strong>Vercel</strong>{" "}
          (web app and API hosting); <strong>Strava</strong> (only if you connect it); and{" "}
          <strong>Anthropic</strong> (only if the AI chat is enabled, to generate chat replies). These providers
          process data only to provide their service to us.
        </P>

        <H2>Data retention and deletion</H2>
        <P>
          We keep your information while your account is active and as needed to provide the service. To request
          deletion of your account and data, or a copy of your data, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--brand-strong)" }}>{CONTACT_EMAIL}</a> from
          your account email (or, for a minor, a parent/guardian). You can stop RunGuard from reading Apple
          Health data anytime in iOS Settings, and disconnect Strava anytime.
        </P>

        <H2>Minors (athletes under 18)</H2>
        <P>
          RunGuard is designed for school and club teams, and many athletes are under 18. It is intended to be
          used with the involvement of a coach or school and, for athletes under 18, with the permission of a
          parent or guardian. Coaches and schools who invite athletes are responsible for obtaining the consent
          required by their institution and by law before an athlete&rsquo;s data is collected. Parents/guardians
          may contact us to review, correct, or delete their child&rsquo;s information or withdraw consent.
        </P>
        <P>
          RunGuard is not directed to children under 13, and we do not knowingly collect personal information
          from a child under 13 without verifiable parental consent as required by COPPA. If you believe a child
          under 13 provided information without such consent, contact us and we will delete it. Where RunGuard is
          used by a school, data may also be subject to school-privacy obligations such as FERPA. Health data of
          minors receives the same protections described here: never sold, never used for advertising, never
          shared with data brokers.
        </P>

        <H2>Security</H2>
        <P>
          We use encryption in transit (HTTPS/TLS), store passwords only as salted hashes, use per-athlete
          pairing tokens and signed session cookies, limit athlete data to that athlete and their coach, and rely
          on established infrastructure providers. No method of transmission or storage is 100% secure, and we
          cannot guarantee absolute security.
        </P>

        <H2>Your choices and rights</H2>
        <P>
          You can grant or revoke Apple Health access per data type in iOS Settings, choose whether to connect
          Strava, choose whether to submit check-ins, and request access to, correction of, or deletion of your
          data by emailing us. Depending on where you live, you may have additional rights under laws such as the
          GDPR or CCPA/CPRA; contact us to exercise them.
        </P>

        <H2>Changes to this policy</H2>
        <P>
          We may update this policy from time to time. When we make material changes we will update the effective
          date above and, where appropriate, notify you. Continued use of RunGuard after an update means you
          accept the revised policy.
        </P>

        <H2>Contact</H2>
        <P>
          Questions, requests, or concerns about privacy:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--brand-strong)" }}>{CONTACT_EMAIL}</a>.
        </P>
      </main>
    </div>
  );
}
