/**
 * The privacy policy, rendered in the app.
 *
 * Apple requires a reachable privacy policy, and RunGuard reads HealthKit, so
 * this cannot be a link out: a URL that 404s at review time is a rejection, and
 * an athlete who taps it on a track with no signal gets nothing. Every word is
 * in the bundle.
 *
 * The text is a port of `website/src/app/privacy/page.tsx`. The SUBSTANCE must
 * not drift from that page — two policies making different promises about the
 * same health data is a real problem, not a copy-editing one — so the
 * commitments, the provider list, the retention answer and the contact address
 * are carried over verbatim in meaning. Only the voice changed: the website
 * writes about the athlete, this writes to them.
 *
 * ── THE SHAPE: `Section` OVER A `Card`, LIKE EVERY OTHER SCREEN ─────────────
 *
 * The design study has no privacy screen, so this one is built out of the app's
 * own language rather than invented: each part of the policy is a `Section` —
 * the eyebrow that names a group — over one `Card` of prose, at the page inset
 * and card radius every other screen uses, under the same `useScreenHeader`
 * its siblings carry.
 *
 * It replaces a local Panel that put the part's name INSIDE the card at 14px
 * semibold. That was the website's shape, and it is the wrong one here: these
 * headings name a GROUP of paragraphs, which is exactly the rank `Section`
 * exists for, and a policy is the last place in the app that should be reading
 * in a voice of its own.
 *
 * The notes moved with it. They were authored in caps ("HEALTH ONLY IF YOU
 * ALLOW IT") to sit in the old note's uppercase mono; `Section`'s note is 14px
 * body, where caps read as shouting, so each is sentence-cased. The WORDS are
 * unchanged and so is the policy — only the case, and only on the notes, which
 * are the app's own tags rather than the policy's text.
 */
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { Card } from "../components/Card";
import { Section } from "../components/Section";
import { dayLabel } from "../lib/dates";
import { useScreenHeader } from "../theme/header";
import { color } from "../theme/tokens";
import { font, tabular, text } from "../theme/type";
import { layout, radius, space } from "../theme/space";

/** Same address as the website policy. Changing one without the other is a bug. */
const CONTACT_EMAIL = "gargaditya061@gmail.com";

/**
 * The effective date, and the one place it is written down. `dayLabel` supplies
 * the words (non-negotiable #2: no component derives a date); the year is taken
 * off the same ISO string rather than typed twice, because a policy date that
 * disagrees with itself is worse than no date. A four-digit year matters here in
 * a way it does not on a training screen.
 */
const EFFECTIVE_DAY = "2026-08-01";
const EFFECTIVE_LABEL = `${dayLabel(EFFECTIVE_DAY)} ${EFFECTIVE_DAY.slice(0, 4)}`;

/** The ember signature, as used by WeekProgress — 135° on the web, x/y here. */
const EMBER_STOPS = [0, 0.45, 1] as const;
const EMBER_START = { x: 0, y: 0 } as const;
const EMBER_END = { x: 1, y: 1 } as const;

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={useScreenHeader("Privacy")} />

      <ScrollView contentContainerStyle={styles.page}>
        {/*
          The document head. Its eyebrow is the policy's own name rather than
          the screen's — the native header already says "Privacy" — and its note
          is the effective date, which every other section is dated against.
        */}
        <Section
          label="RunGuard privacy policy"
          note={
            <>
              Effective <Text style={styles.figure}>{EFFECTIVE_LABEL}</Text>
            </>
          }
        >
          <Card style={styles.body}>
            <LinearGradient
              colors={color.ember}
              locations={EMBER_STOPS}
              start={EMBER_START}
              end={EMBER_END}
              style={styles.mark}
            />
            <Text style={styles.p}>
              RunGuard is an injury-prevention tool for runners. It reads your training
              and recovery data, works out an injury-risk reading, and shows that
              reading to you and to the coach of your team.
            </Text>
            <Text style={styles.p}>
              This covers the RunGuard iPhone app and the RunGuard web dashboard: what
              is collected, what it is used for, who sees it, and what you can change.
              Many RunGuard athletes are under <Text style={styles.figure}>18</Text>; the
              section for them is below and worth reading.
            </Text>
          </Card>
        </Section>

        <Section label="What is collected" note="Health only if you allow it">
          <Card style={styles.body}>
            <Text style={styles.p}>
              <Text style={styles.lead}>Your account. </Text>
              Name, email, password (kept only as a hash), team or school, class year, the
              events you run, and the sign-in session that links this phone to your account.
            </Text>
            <Text style={styles.p}>
              <Text style={styles.lead}>Apple Health, only with your permission. </Text>
              Running and related workouts: start time, duration, distance, average and
              maximum heart rate, active calories, cadence. Daily recovery figures: resting
              heart rate, heart-rate variability, sleep duration and stages, VO2max,
              respiratory rate, blood oxygen, wrist temperature. When a workout has a GPS
              track, the route as well, so your activity map can show where you ran. You can
              change or withdraw this at any time in Settings, under Privacy & Security,
              then Health, then RunGuard.
            </Text>
            <Text style={styles.p}>
              <Text style={styles.lead}>Your check-ins, if you fill them in. </Text>
              Session effort, where you are sore and how much, energy, motivation, and
              whether school is stressful right now. Check-ins are optional.
            </Text>
            <Text style={styles.p}>
              <Text style={styles.lead}>Chat messages. </Text>
              The questions you type in the chat tab, and the replies. They are stored so
              you and your coach can see the conversation. They are not sent to any outside
              company &mdash; answers are worked out on our own servers from your training
              data.
            </Text>
            <Text style={styles.p}>
              No payment details are collected. RunGuard carries no advertising SDKs and no
              cross-app tracking.
            </Text>
          </Card>
        </Section>

        <Section label="What it is used for" note="Never for advertising">
          <Card style={styles.body}>
            <Text style={styles.p}>
              Only to run RunGuard and make it better: to work out your training load and
              injury-risk reading, to show you your readiness, plan, mileage, maps and
              history, to show your coach the same information for the athletes on their
              team, to answer the coaching chat, and to keep the service secure and working.
            </Text>
            <View style={styles.commitment}>
              <Text style={styles.commitmentTitle}>Health-data commitments</Text>
              <Text style={styles.commitmentLine}>
                Your health and recovery data is never used for advertising or marketing.
              </Text>
              <Text style={styles.commitmentLine}>It is never sold.</Text>
              <Text style={styles.commitmentLine}>
                It is never shared with third parties such as data brokers.
              </Text>
              <Text style={styles.commitmentLine}>
                It is used only to provide the injury-prevention service described here, to
                you and to your coach. This is what Apple requires of any app that reads
                Health, and what we hold ourselves to regardless.
              </Text>
            </View>
          </Card>
        </Section>

        <Section label="Who can see it" note="Your coach">
          <Card style={styles.body}>
            <Text style={styles.p}>
              Your risk reading, training history, activity maps and check-ins are visible
              to the coach of your team. That is the point of the product rather than a side
              effect of it.
            </Text>
            <Text style={styles.p}>
              Beyond that, information is shared only as far as running the service
              requires: with the providers listed below who host and operate RunGuard for
              us, if the law requires it, and, if RunGuard were ever transferred to another
              owner, under this same policy. Your personal information and health data are
              not sold, and are not shared with data brokers or advertisers.
            </Text>
          </Card>
        </Section>

        <Section label="Who processes it" note="Two providers">
          <Card style={styles.body}>
            <Text style={styles.p}>
              <Text style={styles.lead}>Supabase </Text>
              stores the database and handles sign-in and backend hosting.
            </Text>
            <Text style={styles.p}>
              <Text style={styles.lead}>Vercel </Text>
              hosts the web app and the API.
            </Text>
            <Text style={styles.p}>
              Each of them handles the data only to provide their service to us. No
              third-party AI service receives your data.
            </Text>
          </Card>
        </Section>

        <Section label="Keeping and deleting" note="Ask any time">
          <Card style={styles.body}>
            <Text style={styles.p}>
              Your information is kept while your account is active and for as long as
              providing the service needs it.
            </Text>
            <Text style={styles.p}>
              To have your account and data deleted, or to get a copy of your data, email{" "}
              <Text style={styles.email} selectable accessibilityRole="text">
                {CONTACT_EMAIL}
              </Text>{" "}
              from your account email address. For an athlete under{" "}
              <Text style={styles.figure}>18</Text>, a parent or guardian can write
              instead. You can stop RunGuard reading Apple Health at any time in Settings,
              which stops all further collection.
            </Text>
          </Card>
        </Section>

        <Section label="Athletes under 18" note="COPPA and FERPA">
          <Card style={styles.body}>
            <Text style={styles.p}>
              RunGuard is built for school and club teams, and many of its athletes are
              minors. It is meant to be used with a coach or school involved and, for
              athletes under <Text style={styles.figure}>18</Text>, with a parent or
              guardian’s permission. Coaches and schools who invite athletes are
              responsible for getting whatever consent their
              institution and the law require before an athlete’s data is collected. Parents
              and guardians can contact us to review, correct or delete their child’s
              information, or to withdraw consent.
            </Text>
            <Text style={styles.p}>
              RunGuard is not directed at children under <Text style={styles.figure}>13</Text>,
              and we do not knowingly collect personal information from a child under{" "}
              <Text style={styles.figure}>13</Text> without the verifiable parental consent
              COPPA requires. If you believe a child under <Text style={styles.figure}>13</Text>{" "}
              gave us information without that consent, contact us and it will be deleted.
              Where a school uses
              RunGuard, the data may also fall under school-privacy obligations such as
              FERPA. Health data belonging to a minor gets exactly the protections above:
              never sold, never used for advertising, never given to data brokers.
            </Text>
          </Card>
        </Section>

        <Section label="Security" note="Not a guarantee">
          <Card style={styles.body}>
            <Text style={styles.p}>
              Data is encrypted in transit over HTTPS. Passwords are stored only as salted
              hashes. Each athlete’s phone holds its own signed session, the web uses signed
              cookies, and an athlete’s data is limited to that athlete and their coach. The
              infrastructure underneath is run by established providers.
            </Text>
            <Text style={styles.p}>
              No method of sending or storing data is completely secure, so absolute
              security is not something anyone can promise, including us.
            </Text>
          </Card>
        </Section>

        <Section label="Your choices" note="GDPR and CCPA">
          <Card style={styles.body}>
            <Text style={styles.p}>
              You choose which Apple Health data types RunGuard may read, and can change any
              of them in Settings. You choose whether to submit a check-in. You can ask to see, correct or delete your data by
              emailing us.
            </Text>
            <Text style={styles.p}>
              Depending on where you live you may have further rights, under laws such as
              the GDPR or CCPA/CPRA. Contact us to use them.
            </Text>
          </Card>
        </Section>

        <Section
          label="Changes to this policy"
          note={
            <>
              Since <Text style={styles.figure}>{EFFECTIVE_LABEL}</Text>
            </>
          }
        >
          <Card style={styles.body}>
            <Text style={styles.p}>
              This policy may be updated from time to time. When a change is material the
              effective date above is updated and, where it makes sense, you are told.
              Continuing to use RunGuard after an update means the revised policy applies.
            </Text>
          </Card>
        </Section>

        <Section label="Contact" note="Email">
          <Card style={styles.body}>
            <Text style={styles.p}>
              Questions, requests or concerns about privacy go to{" "}
              <Text style={styles.email} selectable accessibilityRole="text">
                {CONTACT_EMAIL}
              </Text>
              .
            </Text>
          </Card>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  /**
   * The page inset every other screen uses — `settings.tsx`, which is the
   * screen this one is pushed from, is the same three lines. The section gap
   * replaces the per-panel `marginBottom` this used to carry, so the spacing
   * between two parts is now the app's one section step rather than a card
   * padding borrowed as a margin.
   */
  page: {
    paddingHorizontal: layout.page,
    paddingVertical: layout.section,
    gap: layout.section,
  },
  /**
   * The one ember mark on the screen: a short gradient rule over the opening
   * paragraph. No `marginBottom` — it is a child of the card's own `gap` now,
   * and carrying both would space it twice as far as every paragraph below it.
   */
  mark: {
    width: space.xxxl,
    height: space.xs,
    borderRadius: radius.pill,
  },

  /**
   * Paragraph spacing, passed to `Card` as its layout style: `CardProps.style`
   * is merged last and is for exactly this. A gap rather than a trailing
   * margin, so the last paragraph does not add invisible padding to the bottom
   * of the card.
   */
  body: { gap: space.md },
  p: { ...text.base, color: color.ink2 },
  /** The website's <strong> lead-in, in the body's own semibold. */
  lead: { fontFamily: font.bodySemi, color: color.ink },

  /**
   * The four promises Apple's HealthKit rules turn on, lifted out of the prose
   * so they cannot be skimmed past. Sunken rather than tinted — no alarm colour,
   * no border, nothing that reads as a warning.
   */
  commitment: {
    backgroundColor: color.well,
    borderRadius: radius.control,
    // The squircle iOS draws itself. Every non-pill corner in the app carries
    // it; `mark` above is the exception because it is a capsule, where it is a
    // no-op (see theme/space.ts).
    borderCurve: "continuous",
    padding: layout.cardPadding,
    gap: space.sm,
  },
  commitmentTitle: {
    ...text.meta,
    fontFamily: font.bodySemi,
    color: color.ink,
  },
  commitmentLine: { ...text.meta, color: color.ink2 },

  /**
   * A numeral inside a sentence — "under 18", "under 13".
   *
   * Same name and same shape as `chat.tsx` and `login.tsx`: it sets
   * only the FACE, inheriting size and colour from the paragraph around it, so
   * an age stays mono and tabular a word deep in prose. On a policy the ages
   * are the operative numbers in the whole section, and reading them as words
   * is exactly what non-negotiable #3 exists to stop.
   *
   * `VO2max` is deliberately NOT wrapped: its 2 is a subscript in a term, not a
   * quantity, and mono there would read as a typo.
   */
  figure: { fontFamily: font.mono, ...tabular },
  /** Ember on type, so `brandText` — 5.21:1 on card. `brand` would be 2.01:1. */
  email: { fontFamily: font.bodySemi, color: color.brandText },
});
