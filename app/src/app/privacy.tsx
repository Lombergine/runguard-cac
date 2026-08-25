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
 * Layout is the website's Panel hierarchy (`website/src/components/athlete/
 * tabs.tsx:22`): title left, one muted note right, then the prose. On a policy
 * the note earns its place — it is the caveat you would otherwise have to read
 * the whole panel to find.
 */
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { Card } from "../components/Card";
import { dayLabel } from "../lib/dates";
import { color } from "../theme/tokens";
import { font, text } from "../theme/type";
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

/**
 * The website's Panel, in React Native: 14 semibold title on the left, an
 * optional micro note on the right, then the content.
 */
function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <Card>
        <View style={styles.head}>
          <Text style={styles.panelTitle} accessibilityRole="header">
            {title}
          </Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </View>
        <View style={styles.body}>{children}</View>
      </Card>
    </View>
  );
}

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Privacy",
          headerStyle: { backgroundColor: color.bg },
          headerTintColor: color.ink,
          headerShadowVisible: false,
          headerTitleStyle: {
            fontFamily: text.title.fontFamily,
            fontSize: text.title.fontSize,
          },
        }}
      />

      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.panel}>
          <Card>
            <LinearGradient
              colors={color.ember}
              locations={EMBER_STOPS}
              start={EMBER_START}
              end={EMBER_END}
              style={styles.mark}
            />
            <View style={styles.head}>
              <Text style={styles.panelTitle} accessibilityRole="header">
                RunGuard privacy policy
              </Text>
              <Text style={styles.note}>{`EFFECTIVE ${EFFECTIVE_LABEL}`}</Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.p}>
                RunGuard is an injury-prevention tool for runners. It reads your training
                and recovery data, works out an injury-risk reading, and shows that
                reading to you and to the coach of your team.
              </Text>
              <Text style={styles.p}>
                This covers the RunGuard iPhone app and the RunGuard web dashboard: what
                is collected, what it is used for, who sees it, and what you can change.
                Many RunGuard athletes are under 18; the section for them is below and
                worth reading.
              </Text>
            </View>
          </Card>
        </View>

        <Panel title="What is collected" note="HEALTH ONLY IF YOU ALLOW IT">
          <Text style={styles.p}>
            <Text style={styles.lead}>Your account. </Text>
            Name, email, password (kept only as a hash), team or school, class year, the
            events you run, and the pairing token that links this phone to your account.
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
            <Text style={styles.lead}>Strava, only if you connect it. </Text>
            Recent activities, including distance, duration, heart rate and the GPS route.
            You authorise this through Strava and can disconnect whenever you like.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.lead}>Coach chat, only if it is switched on. </Text>
            The messages you type, and the training context needed to answer them, are
            sent to our AI provider, Anthropic, to write the reply.
          </Text>
          <Text style={styles.p}>
            No payment details are collected. RunGuard carries no advertising SDKs and no
            cross-app tracking.
          </Text>
        </Panel>

        <Panel title="What it is used for" note="NEVER FOR ADVERTISING">
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
        </Panel>

        <Panel title="Who can see it" note="YOUR COACH">
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
        </Panel>

        <Panel title="Who processes it" note="FOUR PROVIDERS">
          <Text style={styles.p}>
            <Text style={styles.lead}>Supabase </Text>
            stores the database and handles sign-in and backend hosting.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.lead}>Vercel </Text>
            hosts the web app and the API.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.lead}>Strava </Text>
            is involved only if you connect it.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.lead}>Anthropic </Text>
            is involved only if the coach chat is switched on, to generate replies.
          </Text>
          <Text style={styles.p}>
            Each of them handles the data only to provide their service to us.
          </Text>
        </Panel>

        <Panel title="Keeping and deleting" note="ASK ANY TIME">
          <Text style={styles.p}>
            Your information is kept while your account is active and for as long as
            providing the service needs it.
          </Text>
          <Text style={styles.p}>
            To have your account and data deleted, or to get a copy of your data, email{" "}
            <Text style={styles.email} selectable accessibilityRole="text">
              {CONTACT_EMAIL}
            </Text>{" "}
            from your account email address. For an athlete under 18, a parent or guardian
            can write instead. You can stop RunGuard reading Apple Health at any time in
            Settings, and disconnect Strava at any time.
          </Text>
        </Panel>

        <Panel title="Athletes under 18" note="COPPA AND FERPA">
          <Text style={styles.p}>
            RunGuard is built for school and club teams, and many of its athletes are
            minors. It is meant to be used with a coach or school involved and, for
            athletes under 18, with a parent or guardian's permission. Coaches and schools
            who invite athletes are responsible for getting whatever consent their
            institution and the law require before an athlete's data is collected. Parents
            and guardians can contact us to review, correct or delete their child's
            information, or to withdraw consent.
          </Text>
          <Text style={styles.p}>
            RunGuard is not directed at children under 13, and we do not knowingly collect
            personal information from a child under 13 without the verifiable parental
            consent COPPA requires. If you believe a child under 13 gave us information
            without that consent, contact us and it will be deleted. Where a school uses
            RunGuard, the data may also fall under school-privacy obligations such as
            FERPA. Health data belonging to a minor gets exactly the protections above:
            never sold, never used for advertising, never given to data brokers.
          </Text>
        </Panel>

        <Panel title="Security" note="NOT A GUARANTEE">
          <Text style={styles.p}>
            Data is encrypted in transit over HTTPS. Passwords are stored only as salted
            hashes. Each athlete's phone has its own pairing token, sessions use signed
            cookies, and an athlete's data is limited to that athlete and their coach. The
            infrastructure underneath is run by established providers.
          </Text>
          <Text style={styles.p}>
            No method of sending or storing data is completely secure, so absolute
            security is not something anyone can promise, including us.
          </Text>
        </Panel>

        <Panel title="Your choices" note="GDPR AND CCPA">
          <Text style={styles.p}>
            You choose which Apple Health data types RunGuard may read, and can change any
            of them in Settings. You choose whether to connect Strava. You choose whether
            to submit a check-in. You can ask to see, correct or delete your data by
            emailing us.
          </Text>
          <Text style={styles.p}>
            Depending on where you live you may have further rights, under laws such as
            the GDPR or CCPA/CPRA. Contact us to use them.
          </Text>
        </Panel>

        <Panel title="Changes to this policy" note={`SINCE ${EFFECTIVE_LABEL}`}>
          <Text style={styles.p}>
            This policy may be updated from time to time. When a change is material the
            effective date above is updated and, where it makes sense, you are told.
            Continuing to use RunGuard after an update means the revised policy applies.
          </Text>
        </Panel>

        <Panel title="Contact" note="EMAIL">
          <Text style={styles.p}>
            Questions, requests or concerns about privacy go to{" "}
            <Text style={styles.email} selectable accessibilityRole="text">
              {CONTACT_EMAIL}
            </Text>
            .
          </Text>
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  page: {
    paddingHorizontal: layout.page,
    paddingTop: layout.cardPadding,
    paddingBottom: layout.section,
  },
  panel: { marginBottom: layout.cardPadding },

  /** The one ember mark on the screen: a short gradient rule over the title. */
  mark: {
    width: space.xxxl,
    height: space.xs,
    borderRadius: space.xs,
    marginBottom: layout.cardPadding,
  },

  /**
   * Title and note share a baseline and wrap independently, so a long note drops
   * under the title rather than squeezing it to one word per line.
   */
  head: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.sm,
    marginBottom: space.md,
  },
  /** 14 semibold, matching the website's Panel heading. */
  panelTitle: {
    ...text.meta,
    fontFamily: font.bodySemi,
    color: color.ink,
    flexShrink: 1,
  },
  /** The note is always the caveat. Muted: 5.17:1 on card. */
  note: { ...text.micro, color: color.muted },

  /**
   * Paragraphs are spaced by the container's `gap`, not a trailing margin, so
   * the last one does not add invisible padding to the bottom of the card.
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
    padding: layout.cardPadding,
    gap: space.sm,
  },
  commitmentTitle: {
    ...text.meta,
    fontFamily: font.bodySemi,
    color: color.ink,
  },
  commitmentLine: { ...text.meta, color: color.ink2 },

  /** Ember on type, so `brandText` — 5.21:1 on card. `brand` would be 2.01:1. */
  email: { fontFamily: font.bodySemi, color: color.brandText },
});
