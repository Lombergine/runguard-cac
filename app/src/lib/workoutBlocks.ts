/**
 * Warm-up / main set / cool-down for a plan day.
 *
 * A FAITHFUL port of `workoutBlocks`
 * (website/src/components/athlete/tabs.tsx:67-98), including its
 * lowercase-substring tests and its exact strings. It is deliberately not
 * "improved": the surfaces must describe the same session in the same words,
 * and the athlete may well be looking at more than one of them.
 *
 * WHY IT LIVES IN lib/ AND NOT IN A COMPONENT. Two screens render this now —
 * the week's disclosure rows in components/PlanWeek, and today's session on
 * Home in components/TodayBlock. Both must say the same thing about the same
 * day, so the derivation is shared and only the presentation differs. This
 * follows lib/readinessVerdict, which was extracted from the same web file for
 * the same reason: a rule copied from the website is kept in exactly one place
 * on this side, so "grep it on both sides" stays a two-file check.
 *
 * The one substitution is `formatDistance` for the website's `${miNum(km)} mi`,
 * which is the same arithmetic and the same output — this app has no supported
 * way to produce a bare numeral.
 *
 * An empty array means the day prescribes nothing to break down (Rest); the
 * caller falls back to `details`, as the website does.
 */
import type { PlanDay } from "./types";
import { formatDistance } from "./units";

export type Block = { label: string; text: string; accent?: boolean };

export function workoutBlocks(d: PlanDay): Block[] {
  const t = d.type.toLowerCase();
  if (t.includes("rest")) return [];
  if (t.includes("race day")) {
    return [
      {
        label: "Warm-up",
        text: "20 min build + 4× strides, finishing 12–15 min before the gun.",
      },
      { label: "Race", text: d.details, accent: true },
    ];
  }
  const isWorkout =
    t.includes("workout") ||
    t.includes("tempo") ||
    t.includes("×") ||
    t.includes("interval") ||
    t.includes("race-pace") ||
    t.includes("400");
  const main: Block = {
    label: "Main set",
    text: `${d.distanceKm ? formatDistance(d.distanceKm) : ""}${
      d.targetPace ? ` @ ${d.targetPace}` : ""
    }${d.distanceKm || d.targetPace ? " — " : ""}${d.details}`,
    accent: true,
  };
  if (!isWorkout) {
    // Easy and steady runs: one block, plus a strides note when the day's own
    // name mentions them.
    const blocks = [main];
    if (t.includes("stride")) {
      blocks.push({
        label: "Finish",
        text: "Relaxed strides on grass, walk-back recovery — turnover, not effort.",
      });
    }
    return blocks;
  }
  return [
    {
      label: "Warm-up",
      text: "1 mi easy jog + leg swings, A-skips, and 3 build-ups to open the legs.",
    },
    main,
    {
      label: "Cool-down",
      text: "0.5 mi easy jog + light stretching while you're still warm.",
    },
  ];
}
