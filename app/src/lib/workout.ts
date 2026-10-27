/**
 * How a planned session breaks down: warm-up, main set, cool-down.
 *
 * A FAITHFUL port of `workoutBlocks` (website/src/components/athlete/
 * tabs.tsx:67-98), including its lowercase-substring tests and its exact
 * strings. It is deliberately not "improved": the two surfaces must describe the
 * same session in the same words, and the athlete may well be looking at both.
 *
 * The one substitution is `formatDistance` for the website's `${miNum(km)} mi`,
 * which is the same arithmetic and the same output — this app has no supported
 * way to produce a bare numeral (non-negotiable #3).
 *
 * WHY THIS IS IN lib/ RATHER THAN IN A COMPONENT. Two surfaces need it: the
 * week's plan (components/PlanWeek) and today's session on the home screen
 * (components/TodayBlock). It lived in PlanWeek first, and the second caller is
 * exactly the moment a copy would have been made — at which point one of the two
 * would eventually be edited and the app would describe the same run two
 * different ways depending on which screen you opened. There is one derivation.
 *
 * An empty array means the day prescribes nothing to break down (Rest); the
 * caller falls back to `details`, as the website does.
 */
import type { PlanDay } from "./types";
import { formatDistance } from "./units";

export type WorkoutBlock = { label: string; text: string; accent?: boolean };

export function workoutBlocks(d: PlanDay): WorkoutBlock[] {
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
  const main: WorkoutBlock = {
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
        text: "Relaxed strides on grass, walk-back recovery, turnover, not effort.",
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
