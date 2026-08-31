/**
 * Data sources — is anything actually arriving, and from whom.
 *
 * The one question this screen answers, per its endpoint's own docblock:
 * `lastSyncForTeam` reads the most recent real activity rather than a stored
 * link flag, because "an athlete can be linked and sending nothing, and a link
 * state would report that as healthy".
 *
 * ── NO TOKEN, ANYWHERE ─────────────────────────────────────────────────────
 *
 * The design puts a "Copy token" action on every row. It is not here, and this
 * is not a styling decision: a device token is a permanent bearer credential for
 * a minor's health data, `/api/mobile/coach/sources` deliberately does not carry
 * one, and app/CLAUDE.md's rule is flat — "a token is never rendered, never
 * logged". There is no button, no clipboard write, and no sentence telling a
 * coach where to find one, because a screen that explains how to obtain a
 * credential is a smaller version of the same surface. Pairing stays a web
 * action.
 *
 * ── THE ONE HONESTY RULE THIS SCREEN TURNS ON ──────────────────────────────
 *
 * `hasSynced: false` is a MEASURED FACT, not an unknown — the query looked and
 * found nothing. So the row does not render `Absent`'s dashed slot, which means
 * "we do not know". It states the fact in words and puts the app's dash in the
 * DATE's position, which is the part that genuinely does not exist. Either way
 * it must not read as fine: a coach scanning fourteen rows for the one athlete
 * whose watch stopped is exactly the reader a blank would mislead.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "../../components/Card";
import { Section } from "../../components/Section";
import { ScreenHeader, useTabHeaderActions } from "../../components/ScreenHeader";
import { getCoachSources, type CoachSources } from "../../lib/api";
import { dayLabel, localDay } from "../../lib/dates";
import { dim } from "../../theme/press";
import { layout, radius, ruleWidth, space, target } from "../../theme/space";
import { color } from "../../theme/tokens";
import { font, tabular, text } from "../../theme/type";

/**
 * The row's initials circle. `space.xxl + space.xs` is 36 — the design's 34 is
 * not on the 4px scale, and app/CLAUDE.md makes the theme the single source for
 * a size. Smaller than the roster's 40 because this is a reference list rather
 * than the screen a coach triages from.
 */
const AVATAR = space.xxl + space.xs;

/** Row height floor, and what a skeleton reserves. Two lines in a 52pt row. */
const ROW_H = target.row + space.md;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/* ------------------------------------------------------------------ *
 * The screen
 * ------------------------------------------------------------------ */

export default function SourcesScreen() {
  const actions = useTabHeaderActions();

  const [sources, setSources] = useState<CoachSources | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    try {
      setSources(await getCoachSources());
      setFailed(null);
    } catch (err) {
      // The server's own sentence. Never the raw thrown value: a fetch rejection
      // can echo the request, and this request carries a coach Bearer.
      setFailed(
        err instanceof Error ? err.message : "The data sources could not be loaded."
      );
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  /**
   * The first load, started once.
   *
   * The indirection through a ref is `lib/profileStore.tsx`'s `ensure()`, and it
   * is not ceremony: an effect that calls a fetch which sets state on its way in
   * is a cascading render, and the app's own store solves it exactly this way.
   * A remount — a tab revisited, a fast refresh — does not refire it; pull to
   * refresh is how a coach asks for new data.
   */
  const started = useRef(false);
  const ensure = useCallback(() => {
    if (started.current) return;
    started.current = true;
    void load(false);
  }, [load]);

  useEffect(() => {
    ensure();
  }, [ensure]);

  const athletes = useMemo(
    () => [...(sources?.athletes ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [sources]
  );

  /*
   * Both dates are formatted HERE, by the screen. Non-negotiable #2: a component
   * never derives one, and `dayLabel` spells the weekday out so nothing on this
   * screen is a bare relative label.
   */
  const today = localDay();
  const syncLabel = (iso: string | null): { lead: string; date: string } | null => {
    if (!iso) return null;
    const day = localDay(new Date(iso));
    // No bare relative label: "today" never stands alone, the explicit local day
    // always follows it.
    return {
      lead: day === today ? "Last run received today ·" : "Last run received",
      date: dayLabel(day),
    };
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScreenHeader
        title="Data sources"
        subtitle="Apple Health is the only live source"
        actions={actions}
      />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
        }
      >
        {failed && !sources ? (
          <Card>
            <Text style={styles.emptyTitle}>Sync state could not be loaded.</Text>
            <Text style={styles.emptyBody}>{failed}</Text>
            <Pressable
              onPress={() => void load(false)}
              accessibilityRole="button"
              accessibilityLabel="Try loading the data sources again"
              style={({ pressed }) => [styles.retry, dim(pressed)]}
            >
              <Text style={styles.retryLabel}>Try again</Text>
            </Pressable>
          </Card>
        ) : !sources ? (
          // Grey bars at the final height. A dash here would claim the network's
          // silence is the athletes' silence.
          <View style={styles.sections}>
            <View style={[styles.skeleton, styles.skeletonHeading]} />
            <View style={[styles.skeleton, { height: ROW_H * 6 }]} />
          </View>
        ) : (
          <View style={styles.sections}>
            {/* The count is the payload's length. The design bakes it into the
                eyebrow string as a literal. */}
            <Section label={`Athletes · ${athletes.length} on the roster`}>
              {athletes.length === 0 ? (
                <Card>
                  <Text style={styles.emptyTitle}>No athletes on this roster yet.</Text>
                  <Text style={styles.emptyBody}>
                    Nothing is failing to sync — there is nobody to sync from.
                    Athletes appear here once they join the team.
                  </Text>
                </Card>
              ) : (
                <Card padded={false} style={styles.list}>
                  {athletes.map((a, i) => {
                    /*
                     * THREE states, not two. The route derives `hasSynced` from
                     * `lastSync.has(id)` and `lastSyncAt` from `.get(id) ?? null`,
                     * so a row CAN come back having synced with no timestamp —
                     * and collapsing that into "never synced" would report a
                     * working watch as a dead one. Never / synced-and-dated /
                     * synced-but-undated stay three separate sentences.
                     */
                    const synced = a.hasSynced ? syncLabel(a.lastSyncAt) : null;
                    return (
                      <View key={a.id} style={styles.row}>
                        <View
                          accessibilityElementsHidden
                          importantForAccessibility="no-hide-descendants"
                          style={styles.avatar}
                        >
                          <Text style={styles.avatarText}>{initialsOf(a.name)}</Text>
                        </View>
                        <View style={styles.rowBody}>
                          <Text style={styles.rowName}>{a.name}</Text>
                          {synced ? (
                            <Text style={styles.sync}>
                              {`${synced.lead} `}
                              {/* The date carries numerals, so it takes the mono
                                  face inside the prose line — the same nesting
                                  `login.tsx` uses for a figure in a sentence. */}
                              <Text style={styles.figure}>{synced.date}</Text>
                            </Text>
                          ) : (
                            /* Never synced. The dash sits where the date would
                               be — the date is the part that does not exist —
                               and the words carry the state so the row still
                               reads correctly in greyscale. */
                            <Text style={styles.syncNever}>
                              {a.hasSynced
                                ? "— a run has arrived, but not when"
                                : "— no run has ever arrived"}
                            </Text>
                          )}
                        </View>
                        {i === athletes.length - 1 ? null : (
                          <View style={styles.separator} pointerEvents="none" />
                        )}
                      </View>
                    );
                  })}
                </Card>
              )}
            </Section>

            {failed ? (
              <Text style={styles.stale}>
                This is the last sync state that loaded. {failed}
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  page: {
    paddingHorizontal: layout.page,
    paddingTop: space.xl,
    paddingBottom: layout.section,
  },
  sections: { gap: layout.section },

  list: { overflow: "hidden" },
  row: {
    minHeight: ROW_H,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: layout.cardPadding,
    paddingVertical: space.sm,
  },
  rowBody: { flex: 1, gap: space.xs },
  rowName: { ...text.base, color: color.ink },
  sync: { ...text.meta, color: color.muted },
  /** Inherits the line's size, leading and colour; changes only the face. */
  figure: { fontFamily: font.mono, ...tabular },
  /**
   * `unknown` is the app's absence colour and it is 5.21:1 here — but the colour
   * is the last thing carrying this state, not the first. The dash and the
   * sentence do the work.
   */
  syncNever: { ...text.meta, color: color.unknown },
  separator: {
    position: "absolute",
    left: layout.cardPadding,
    right: 0,
    bottom: 0,
    height: ruleWidth,
    backgroundColor: color.ruleSoft,
  },

  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: color.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...text.meta, color: color.ink2 },

  emptyTitle: { ...text.base, color: color.ink },
  emptyBody: { ...text.meta, color: color.muted, marginTop: space.xs },
  stale: { ...text.meta, color: color.muted },

  retry: { minHeight: target.min, justifyContent: "center", marginTop: space.md },
  retryLabel: { ...text.baseSemi, color: color.brandText },

  skeleton: {
    backgroundColor: color.well,
    borderRadius: radius.card,
    borderCurve: "continuous",
  },
  skeletonHeading: { height: text.micro.lineHeight as number, width: "55%" },
});
