/**
 * One planned day, opened on its own. A STACK route, not a tab — it is pushed
 * from a row of this week's plan, and it belongs inside
 * `Stack.Protected guard={signedIn}` in the root layout: it shows one athlete's
 * own training, so signed out it must never mount and `/plan/2026-08-31` must
 * have nothing to resolve to.
 *
 * WHY THIS SCREEN DOES NOT FETCH. Unlike `activity/[id]`, there is no
 * single-day endpoint and there does not need to be: `plan.days` is already in
 * the profile the run log rendered the row from, and it is always Monday to
 * Sunday of the current week. So this reads the store and finds the day. The
 * consequence is stated honestly below — a date outside this week is not a day
 * this screen can open, and it says so rather than showing an empty session.
 *
 * ON DATES. Non-negotiable #2: the component takes a PRE-FORMATTED local
 * string. The route param is a raw `YYYY-MM-DD` key — a key, not a label — so
 * it is pattern-matched before anything is done with it and then formatted
 * HERE, through the same `dayLabel` the week's rows use. `SessionDetail`
 * derives nothing. The label is built from `day.date`, the value the payload
 * holds, rather than from the param, so a day can only ever be titled with its
 * own date.
 *
 * The param is matched against `YYYY-MM-DD` rather than trusted: `dayLabel`
 * would turn "yesterday" into "undefined NaN undefined" and print it as a
 * heading, and a deep link is not required to be well-formed.
 */
import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";

import { Panel } from "../../components/Panel";
import { Section } from "../../components/Section";
import { SessionDetail } from "../../components/PlanWeek";
import { dayLabel } from "../../lib/dates";
import { useProfile } from "../../lib/profileStore";
import { useScreenHeader } from "../../theme/header";
import { layout, space } from "../../theme/space";
import { color } from "../../theme/tokens";
import { text } from "../../theme/type";

/** A plan key, and only a plan key. Anything else is not a day to open. */
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export default function SessionScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { profile, state } = useProfile();

  const key = typeof date === "string" && DAY_KEY.test(date) ? date : null;
  const day = key === null ? undefined : profile?.plan.days.find((d) => d.date === key);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={useScreenHeader("Session")} />
      <ScrollView contentContainerStyle={styles.page}>
        {/*
          The design carries "This week's plan" as a subtitle under the header's
          title. The native stack header holds one title, and this app's own
          rank for "which group is this" is the section eyebrow — the same label
          the run log puts above the week it was tapped in, so the two surfaces
          name the group identically.
        */}
        <Section label="This week's plan" />

        {day ? (
          <SessionDetail
            day={day}
            /* Formatted here, exactly as `PlanWeek` formats its rows: today is
               "Today · Mon 10 Aug", never "Today" on its own. */
            dateLabel={day.isToday ? `Today · ${dayLabel(day.date)}` : dayLabel(day.date)}
          />
        ) : profile ? (
          /* The plan landed and this day is not in it. Not "no session" — the
             week the phone holds is Monday to Sunday, and a day outside it is a
             day this screen has nothing to say about, which is a different
             statement from a rest day. */
          <Panel title="Not in this week" note="Nothing to show">
            <Text style={styles.plain}>
              {key === null
                ? "That is not a day RunGuard can open."
                : `RunGuard holds this week's plan, Monday to Sunday, and ${dayLabel(
                    key
                  )} is not in it. The days you can open are in this week's plan on the Runs tab.`}
            </Text>
          </Panel>
        ) : state === "failed" ? (
          <Panel title="This session" note="Could not load">
            <Text style={styles.plain}>
              Could not reach your server, so this session could not be opened. It will
              be here when the connection is.
            </Text>
          </Panel>
        ) : (
          <Panel title="This session" note="Opening">
            <Text style={styles.plain}>Reading it from your server.</Text>
          </Panel>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  /**
   * The design sets 14 top and 16 sides.
   *
   * The sides are `layout.page` (20) — the app's own page inset, and what every
   * other pushed screen uses. Sixteen would make this the one screen whose
   * cards sit 4pt wider than the run screen you reach from the same tab, which
   * is invisible on its own and obvious the moment you push from one to the
   * other. The top is `space.md` (12): the 4px scale has no 14, and 12 is as
   * near as 16 while leaving the header's own breathing room alone.
   */
  page: {
    paddingHorizontal: layout.page,
    paddingTop: space.md,
    paddingBottom: layout.section,
    gap: space.md,
  },
  plain: { ...text.base, color: color.ink2 },
});
