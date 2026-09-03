/**
 * The ask. Home's prompt to connect Apple Health, shown until it is answered.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Everything needed to read Health was already built — the entitlement, both
 * usage strings, `requestAuthorization`, the reader and the ingest call — and
 * all of it sat behind Settings → "Where your numbers come from". An athlete
 * signed in, was never asked, and the app showed them a readiness figure built
 * from a check-in alone while a watch full of the real data went unread. A
 * permission the product depends on cannot be something you have to go looking
 * for.
 *
 * ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────
 * It does not claim a connection. Apple deliberately never discloses READ
 * denial: `requestAuthorization` resolves the same way whether the athlete
 * allowed everything or nothing, so the sheet closing proves only that it was
 * shown. The read that follows is the ONLY evidence, which is why `connect()`
 * here asks and then immediately syncs, and why the copy afterwards reports
 * what actually arrived rather than saying "connected".
 *
 * Renders nothing at all when Health cannot be used (Android, no native module,
 * no Health store) — `/connect` explains those cases properly, and a dead
 * button on the home screen explains nothing.
 */
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import {
  availability,
  getState,
  requestPermissions,
  sync,
  type HealthState,
  type SyncRecord,
} from "../lib/health";
import { committed, failed } from "../lib/motion";
import { color } from "../theme/tokens";
import { text } from "../theme/type";
import { layout, radius, ruleWidth, space, target } from "../theme/space";
import { Press } from "./Press";

/**
 * What the sync brought back, in one sentence.
 *
 * Zero of both after a completed prompt is the shape a denial takes, and it is
 * the one outcome worth spelling out — the athlete has no other way to learn
 * that the sheet they just dismissed left the app with nothing.
 */
function outcome(record: SyncRecord): string {
  const { workouts, metrics } = record.imported;
  if (workouts === 0 && metrics === 0) {
    return "Nothing came through. If you left any switches off, turn them on in Settings › Privacy & Security › Health › RunGuard.";
  }
  const parts: string[] = [];
  if (workouts > 0) parts.push(`${workouts} ${workouts === 1 ? "run" : "runs"}`);
  if (metrics > 0) parts.push(`${metrics} ${metrics === 1 ? "reading" : "readings"}`);
  return `${parts.join(" and ")} came through.`;
}

export function ConnectHealthPrompt({ onConnected }: { onConnected?: () => void }) {
  const router = useRouter();
  const avail = availability();
  const [health, setHealth] = useState<HealthState | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!avail.ok) return;
    getState()
      .then((s) => {
        if (alive) setHealth(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [avail.ok]);

  const connect = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      // Ask, then read. The read is the only real evidence — see the header.
      await requestPermissions();
      const record = await sync();
      committed();
      setResult(outcome(record));
      onConnected?.();
    } catch {
      failed();
      setResult(
        "Apple Health could not be read on this phone. Nothing was sent. Open Settings for the details."
      );
    }
    setHealth(await getState().catch(() => null));
    setBusy(false);
  }, [busy, onConnected]);

  // Health is unusable here, or the athlete has already been asked and data is
  // flowing. Either way this card has nothing left to say.
  if (!avail.ok) return null;
  if (health === null) return null;
  if (health.requestedAt !== null && result === null) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Apple Health</Text>
      <Text style={styles.title}>Let RunGuard read your runs</Text>
      <Text style={styles.body}>
        Your workouts, sleep, resting heart rate and HRV are already on this
        phone. RunGuard reads them to work out your training load — without
        them, readiness rests on your check-in alone.
      </Text>

      {result === null ? (
        <Press
          onPress={() => void connect()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Connect Apple Health"
          accessibilityState={{ disabled: busy }}
          style={[styles.action, busy && styles.actionBusy]}
          pressedStyle={styles.actionPressed}
        >
          <Text style={styles.actionLabel}>
            {busy ? "Reading Health…" : "Connect Apple Health"}
          </Text>
        </Press>
      ) : (
        <>
          <Text style={styles.result}>{result}</Text>
          <Press
            onPress={() => router.push("/connect")}
            accessibilityRole="button"
            accessibilityLabel="Open data sources"
            style={styles.quiet}
            pressedStyle={styles.quietPressed}
            haptic="none"
          >
            <Text style={styles.quietLabel}>Where your numbers come from</Text>
          </Press>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /* The one card on Home that is asking for something, so it wears the raised
     surface the check-in uses rather than the flat `card` of a reading. */
  card: {
    marginTop: layout.section,
    padding: layout.cardPadding,
    gap: space.sm,
    backgroundColor: color.raised,
    borderWidth: ruleWidth,
    borderColor: color.raisedRule,
    borderRadius: radius.card,
  },
  eyebrow: { ...text.micro, color: color.brandText },
  title: { ...text.title, color: color.ink },
  body: { ...text.base, color: color.ink2 },
  action: {
    marginTop: space.sm,
    minHeight: target.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: color.brand,
  },
  actionBusy: { backgroundColor: color.surface3 },
  actionPressed: { backgroundColor: color.brandStrong },
  /** Ground on coral: 6.5:1. Ink on coral is 2.6:1. */
  actionLabel: { ...text.baseSemi, color: color.bg },
  result: { ...text.base, color: color.ink2, marginTop: space.xs },
  quiet: {
    minHeight: target.min,
    justifyContent: "center",
  },
  quietPressed: { opacity: 0.6 },
  quietLabel: { ...text.baseSemi, color: color.brandText },
});

export default ConnectHealthPrompt;
