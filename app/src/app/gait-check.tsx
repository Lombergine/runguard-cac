/**
 * Camera gait check. For every runner without an Apple Watch: film ten
 * seconds from the side, on a treadmill or a straight stretch, and the phone
 * measures cadence, vertical bounce and left/right ground-contact asymmetry
 * with Apple Vision, on the device, then compares against your earlier
 * checks. Nothing is uploaded. Heuristic thresholds, labelled as such.
 *
 * `runguard://gait-check?clip=<file-uri>` analyzes a clip already on the
 * phone, which is how the pipeline is exercised on the simulator.
 *
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";

import { Press } from "../components/Press";
import {
  ASYMMETRY_FLAG_PCT,
  analyzeClip,
  checkGait,
  compare,
  history,
  isGaitVisionAvailable,
  type CameraGaitCheck,
} from "../lib/cameraGait";
import { color, shadow } from "../theme/tokens";
import { text } from "../theme/type";
import { layout, radius, ruleWidth, space } from "../theme/space";

const f1 = (x: number | undefined) => (x === undefined ? "—" : x.toFixed(1));
const f0 = (x: number | undefined) => (x === undefined ? "—" : x.toFixed(0));

export default function GaitCheckScreen() {
  const { clip } = useLocalSearchParams<{ clip?: string }>();
  const [busy, setBusy] = useState<string | null>(null);
  const [latest, setLatest] = useState<CameraGaitCheck | null>(null);
  const [prior, setPrior] = useState<CameraGaitCheck[]>([]);
  const [error, setError] = useState<string | null>(null);
  const available = isGaitVisionAvailable();

  const loadHistory = useCallback(async () => {
    setPrior(await history());
  }, []);
  useEffect(() => {
    // Inside an async closure rather than the effect body: this settles after
    // an await, so it does not set state synchronously off the mount.
    void (async () => {
      await loadHistory();
    })();
  }, [loadHistory]);

  const run = useCallback(async (work: () => Promise<CameraGaitCheck | null>, label: string) => {
    setBusy(label);
    setError(null);
    try {
      const before = await history();
      const result = await work();
      if (result) {
        setPrior(before);
        setLatest(result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The clip could not be analyzed.");
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    if (!clip || !available) return;
    // Deferred a tick so the analysis starts after the mount commit, not
    // synchronously inside it.
    const id = setTimeout(() => {
      void run(() => analyzeClip(clip, "library"), "Analyzing clip…");
    }, 0);
    return () => clearTimeout(id);
  }, [clip, available, run]);

  const cmp = latest ? compare(latest, prior) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Camera gait check</Text>
          <Text style={styles.heading}>Your stride, from a clip</Text>
          <Text style={styles.note}>
            Ten seconds from the side, whole body in frame, phone steady: a treadmill or a straight stretch. The phone measures cadence, vertical bounce and how long each foot stays on the ground, on the device. The clip is never uploaded.
          </Text>
        </View>

        {!available ? (
          <View style={styles.panel}>
            <Text style={styles.body}>The camera gait check needs the iOS build of RunGuard.</Text>
          </View>
        ) : (
          <View style={styles.row}>
            <Press onPress={() => void run(() => checkGait("camera"), "Recording…")} accessibilityRole="button" accessibilityLabel="Record a clip" style={styles.button} pressedStyle={styles.pressed}>
              <Text style={styles.buttonLabel}>{busy ?? "Record a clip"}</Text>
            </Press>
            <Press onPress={() => void run(() => checkGait("library"), "Analyzing…")} accessibilityRole="button" accessibilityLabel="Choose a clip from the library" style={styles.buttonQuiet} pressedStyle={styles.pressed}>
              <Text style={styles.buttonQuietLabel}>Choose from library</Text>
            </Press>
          </View>
        )}

        {error ? (
          <View style={styles.panel}>
            <Text style={styles.body}>{error}</Text>
          </View>
        ) : null}

        {latest ? (
          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>{latest.ok ? (cmp && cmp.flags.length ? "Something to look at" : "Stride looks even") : "Not enough to measure"}</Text>
              <Text style={styles.panelNote}>
                {latest.framesWithPose} of {latest.framesProcessed} frames · confidence {f0(latest.meanConfidence * 100)}%
              </Text>
            </View>
            {!latest.ok ? (
              <Text style={styles.body}>{latest.reason}</Text>
            ) : (
              <>
                <View style={styles.grid}>
                  <Figure label="Cadence" value={`${f0(latest.cadenceSpm)} spm`} sub={cmp?.cadenceChange != null ? `${cmp.cadenceChange >= 0 ? "+" : ""}${(cmp.cadenceChange * 100).toFixed(0)}% vs. earlier` : "steps per minute"} />
                  <Figure label="Vertical bounce" value={`${f1(latest.oscillationPctTorso)}% torso`} sub={cmp?.bounceChange != null ? `${cmp.bounceChange >= 0 ? "+" : ""}${(cmp.bounceChange * 100).toFixed(0)}% vs. earlier` : "hip rise per step, as a share of torso length"} />
                  <Figure label="Left contact" value={`${f0(latest.contactLeftMs)} ms`} sub="ankle near its lowest" />
                  <Figure label="Right contact" value={`${f0(latest.contactRightMs)} ms`} sub={latest.contactAsymmetryPct != null ? `${Math.abs(latest.contactAsymmetryPct).toFixed(0)}% ${latest.contactAsymmetryPct > 0 ? "shorter than left" : "longer than left"}` : "ankle near its lowest"} />
                </View>
                {cmp?.flags.length ? cmp.flags.map((f) => <Text key={f} style={styles.flag}>{f}</Text>) : null}
                <Text style={styles.caveat}>
                  {cmp && cmp.baselineChecks >= 2
                    ? `Compared against the median of your ${cmp.baselineChecks} earlier checks.`
                    : "Two more checks and this starts comparing against your own baseline."}{" "}
                  Asymmetry over {ASYMMETRY_FLAG_PCT}% is flagged. These are heuristics from a phone camera, not a lab gait analysis, and not a diagnosis.
                </Text>
              </>
            )}
          </View>
        ) : null}

        {prior.length ? (
          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Earlier checks</Text>
              <Text style={styles.panelNote}>kept on this phone only</Text>
            </View>
            {prior.slice(0, 6).map((p) => (
              <Text key={p.at} style={styles.historyRow}>
                {new Date(p.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {f0(p.cadenceSpm)} spm · bounce {f1(p.oscillationPctTorso)}% · asym {p.contactAsymmetryPct != null ? `${p.contactAsymmetryPct.toFixed(0)}%` : "—"}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>How this is computed</Text>
          <Text style={styles.caveat}>
            Apple&rsquo;s Vision framework finds 19 body joints in each frame. Cadence counts the hip&rsquo;s vertical bounces per minute. Vertical bounce is the hip&rsquo;s peak-to-peak rise divided by torso length, because pixels are not centimetres and the torso is the only ruler in the frame. Ground contact is the share of frames each ankle spends within 15% of its lowest position, turned into milliseconds with the cadence; the asymmetry is the difference between the two feet. The 2026 literature says temporal gait parameters and asymmetry are the features that carry injury signal; the cut points here are heuristics chosen for this app.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={styles.figureValue}>{value}</Text>
      <Text style={styles.figureSub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  page: { padding: layout.page, gap: space.lg, paddingBottom: space.xxxl },
  header: { gap: space.xs },
  eyebrow: { ...text.micro, color: color.brandText },
  heading: { ...text.title, color: color.ink },
  note: { ...text.meta, color: color.ink2 },
  row: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  button: { backgroundColor: color.brand, borderRadius: radius.control, paddingHorizontal: space.lg, paddingVertical: space.md },
  buttonLabel: { ...text.baseSemi, color: color.onBrand },
  buttonQuiet: { backgroundColor: color.control, borderRadius: radius.control, paddingHorizontal: space.lg, paddingVertical: space.md, borderWidth: ruleWidth, borderColor: color.controlEdge },
  buttonQuietLabel: { ...text.baseSemi, color: color.ink },
  pressed: { opacity: 0.8 },
  panel: { backgroundColor: color.card, borderWidth: ruleWidth, borderColor: color.cardEdge, borderRadius: radius.card, padding: layout.cardPadding, gap: space.sm, ...shadow.card },
  panelHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: space.sm },
  panelTitle: { ...text.baseSemi, color: color.ink },
  panelNote: { ...text.meta, color: color.muted },
  body: { ...text.meta, color: color.ink2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  figure: { flexBasis: "47%", flexGrow: 1, backgroundColor: color.well, borderRadius: radius.control, padding: space.md, gap: 2 },
  figureLabel: { ...text.micro, color: color.muted },
  figureValue: { ...text.stat, color: color.ink },
  figureSub: { ...text.meta, color: color.muted },
  flag: { ...text.base, color: color.watchText },
  caveat: { ...text.meta, color: color.muted },
  historyRow: { ...text.meta, color: color.ink2, fontVariant: ["tabular-nums"] },
});
