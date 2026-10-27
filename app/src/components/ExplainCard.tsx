/**
 * "Explain my numbers": the server\u2019s audit explained in plain words by a
 * model that is only allowed to repeat the numbers it was given, shown next
 * to exactly those numbers, with who wrote the words. With no model on the
 * server the card shows RunGuard\u2019s own wording and says so. The model
 * explains the score; it never computes it.
 *
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Press } from "./Press";
import { postExplain, type ExplainResult } from "../lib/api";
import { color, shadow } from "../theme/tokens";
import { text } from "../theme/type";
import { layout, radius, ruleWidth, space } from "../theme/space";

export function ExplainCard({ gait, autoRun = false }: { gait: { gctDriftPct: number | null; voDriftPct: number | null } | null; autoRun?: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [r, setR] = useState<ExplainResult | null>(null);

  const go = async () => {
    setState("loading");
    try {
      setR(await postExplain(gait));
      setState("done");
    } catch {
      setState("error");
    }
  };

  // `runguard://stats?explain=1` asks once on arrival, the same request the
  // button makes.
  useEffect(() => {
    if (!autoRun) return;
    const t = setTimeout(() => void go(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  const inputLines = r
    ? Object.entries(r.input)
        .filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0))
        .map(([k, v]) => {
          const num = (x: unknown) => (typeof x === "number" ? (Number.isInteger(x) ? String(x) : x.toFixed(3)) : String(x));
          return `${k}: ${Array.isArray(v) ? v.map(num).join(", ") : num(v)}`;
        })
    : [];

  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>Explain my numbers</Text>
      </View>
      {state !== "done" ? (
        <>
          <Text style={styles.lede}>
            The panels above in plain words. Every number in the reply is checked against what RunGuard computed before it is shown.
          </Text>
          <Press
            onPress={() => void go()}
            accessibilityRole="button"
            accessibilityLabel="Explain my numbers in plain words"
            style={[styles.button, state === "loading" && styles.buttonBusy]}
            pressedStyle={styles.buttonPressed}
          >
            <Text style={styles.buttonLabel}>{state === "loading" ? "Explaining\u2026" : state === "error" ? "Try again" : "Explain"}</Text>
          </Press>
        </>
      ) : r ? (
        <>
          <Text style={styles.summary}>{r.explanation.summary}</Text>
          <Text style={styles.caution}>{r.explanation.caution}</Text>
          <Text style={styles.citation}>{r.explanation.citation}</Text>
          <View style={styles.inputBox}>
            <Text style={styles.eyebrow}>What the model saw</Text>
            {inputLines.map((l) => (
              <Text key={l} style={styles.inputLine}>{l}</Text>
            ))}
          </View>
          <Text style={styles.source}>
            {r.source === "template"
              ? `RunGuard\u2019s own wording: ${r.fallbackReason}.`
              : `Written by ${r.model} and checked against the numbers above.`}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: color.card,
    borderWidth: ruleWidth,
    borderColor: color.cardEdge,
    borderRadius: radius.card,
    padding: layout.cardPadding,
    gap: space.sm,
    ...shadow.card,
  },
  panelHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: space.sm },
  panelTitle: { ...text.baseSemi, color: color.ink },
  panelNote: { ...text.meta, color: color.muted },
  lede: { ...text.meta, color: color.ink2 },
  button: { alignSelf: "flex-start", backgroundColor: color.brand, borderRadius: radius.control, paddingHorizontal: space.lg, paddingVertical: space.md, marginTop: space.xs },
  buttonBusy: { opacity: 0.7 },
  buttonPressed: { opacity: 0.8 },
  buttonLabel: { ...text.baseSemi, color: color.onBrand },
  summary: { ...text.base, color: color.ink },
  caution: { ...text.meta, color: color.ink2 },
  citation: { ...text.meta, color: color.muted, fontStyle: "italic" },
  inputBox: { backgroundColor: color.well, borderRadius: radius.control, padding: space.md, gap: 2, marginTop: space.xs },
  eyebrow: { ...text.micro, color: color.muted, marginBottom: space.xs },
  inputLine: { ...text.meta, color: color.ink2, fontVariant: ["tabular-nums"] },
  source: { ...text.meta, color: color.muted },
});
