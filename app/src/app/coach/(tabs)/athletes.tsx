/**
 * The squad, and how someone joins it.
 *
 * The iOS mock has an "Athletes · N on the roster" screen and describes token
 * handling on it: "A token is a credential for a minor's health data. It is
 * copied straight to the clipboard and never shown on screen."
 *
 * ── WHY THERE IS NO TOKEN ON THIS SCREEN ───────────────────────────────────
 * That instruction is a description of the WEBSITE's `CopyToken`, and it does
 * not port. `/api/mobile/coach/athlete/[id]` states the rule it is built on:
 *
 *     "`athlete.deviceToken`. `buildProfile` includes it, and it is a full
 *      credential for that athlete's health data. `app/src/lib/api.ts` strips
 *      the same field before any caller sees it; this route is the coach-side
 *      mirror of that rule. A token that never reaches the wire cannot leak
 *      from a phone."
 *
 * Building coach-side token issuance here would mean putting every athlete's
 * device token on the mobile wire — reversing that decision for a convenience,
 * and against `../../../../CLAUDE.md`, which says a token is never rendered and
 * never logged. "Copied, not shown" is a weaker guarantee than "never sent",
 * and the stronger one already holds.
 *
 * It is also not how joining works. An athlete signs up with the TEAM JOIN
 * CODE and the server mints their own device token on their own phone; the
 * coach never holds it. So the invitation on this screen is the join code,
 * which is already on the wire, is not a credential for anyone's health data,
 * and is the thing a coach actually needs to hand out.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Animated,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { ListRow, ListSection } from "../../../components/List";
import { LargeTitle, useScrollTitle } from "../../../components/LargeTitle";
import { TeamAvatar } from "../../../components/TeamAvatar";
import { ApiError } from "../../../lib/api";
import { getRoster, type RosterResponse } from "../../../lib/coachApi";
import { DEFAULT_RANGE } from "../../../lib/range";
import { useSession } from "../../../lib/session";
import { color, shadow } from "../../../theme/tokens";
import { text } from "../../../theme/type";
import { layout, radius, space, target, ruleWidth } from "../../../theme/space";

export default function CoachAthletesScreen() {
  const router = useRouter();
  const { signOutCoach } = useSession();
  const { scrollY, onScroll } = useScrollTitle();

  const [data, setData] = useState<RosterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getRoster(DEFAULT_RANGE));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await signOutCoach();
        return;
      }
      setError(e instanceof Error ? e.message : "Could not load your team.");
    }
  }, [signOutCoach]);

  useEffect(() => {
    // Async closure, so state settles after an await rather than synchronously
    // off the mount. Same shape the other coach screens use.
    void (async () => {
      await load();
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const athletes = data?.athletes ?? [];
  const joinCode = data?.team.joinCode ?? null;

  async function shareCode() {
    if (!joinCode) return;
    // The system share sheet rather than a clipboard write: a coach hands this
    // out in whatever they already use to reach a team, and the sheet is the
    // one affordance that reaches all of them.
    await Share.share({
      message: `Join ${data?.team.name ?? "our team"} on RunGuard with the team code ${joinCode}.`,
    });
  }

  return (
    <View style={styles.screen}>
      <LargeTitle
        title="Athletes"
        subtitle={
          data ? `${athletes.length} on the roster` : undefined
        }
        scrollY={scrollY}
      />
      <Animated.ScrollView
        contentContainerStyle={styles.page}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Could not load your team</Text>
            <Text style={styles.body}>{error}</Text>
          </View>
        ) : !data ? (
          <View style={styles.skeleton} />
        ) : (
          <>
            {joinCode ? (
              <View style={styles.panel}>
                <Text style={styles.kicker}>Team code</Text>
                <Text style={styles.code}>{joinCode}</Text>
                <Text style={styles.body}>
                  An athlete signs up with this code and appears here the moment their watch
                  syncs. It is not a password and not anyone&apos;s health data, it only says
                  which team they are joining.
                </Text>
                <Pressable
                  onPress={shareCode}
                  accessibilityRole="button"
                  accessibilityLabel="Share the team code"
                  style={({ pressed }) => [styles.share, pressed && styles.sharePressed]}
                >
                  <Text style={styles.shareLabel}>Share the code</Text>
                </Pressable>
              </View>
            ) : null}

            <ListSection
              title="On the roster"
              footer="Tap an athlete to open everything RunGuard knows about their training."
            >
              {athletes.length === 0 ? (
                <ListRow
                  label="Nobody yet"
                  detail="Share the team code above to get your first athlete in."
                />
              ) : (
                athletes.map((a) => (
                  <ListRow
                    key={a.id}
                    label={a.name}
                    detail={[a.grade ? `Grade ${a.grade}` : null, a.tier]
                      .filter(Boolean)
                      .join(" · ")}
                    leading={<TeamAvatar name={a.name} hue={a.hue} size={28} />}
                    onPress={() => router.push(`/coach/athlete/${a.id}`)}
                  />
                ))
              )}
            </ListSection>

            <Text style={styles.footnote}>
              RunGuard never shows you an athlete&apos;s sign-in credentials, and never sends
              them to this phone. If someone cannot get in, they reset it from their own
              device: not from here.
            </Text>
          </>
        )}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  page: { padding: layout.page, paddingTop: space.md, gap: space.lg, paddingBottom: space.xxxl },
  skeleton: { height: 280, borderRadius: radius.card, backgroundColor: color.well },

  panel: {
    borderWidth: ruleWidth,
    borderColor: color.cardEdge,
    backgroundColor: color.card,
    borderRadius: radius.card,
    padding: layout.cardPadding,
    gap: space.sm,
    ...shadow.card,
  },
  panelTitle: { ...text.baseSemi, color: color.ink },
  kicker: { ...text.micro, color: color.muted },
  code: { ...text.stat, color: color.brandText, letterSpacing: 2 },
  body: { ...text.meta, color: color.ink2, lineHeight: 20 },
  footnote: { ...text.meta, color: color.muted, lineHeight: 20 },

  share: {
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    backgroundColor: color.fill,
    marginTop: space.xs,
  },
  sharePressed: { backgroundColor: color.fillStrong },
  shareLabel: { ...text.baseSemi, color: color.brandText },
});
