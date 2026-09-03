/**
 * The week as seven bars, Monday to Sunday. Today is coral; the days before it
 * are teal; the days still to come are labels with nothing above them.
 *
 * A past day with no run draws a short stub in the rule colour: that is a
 * measured nothing — the athlete rested — and the spec keeps it visibly apart
 * from "we don't know", which this component never has to draw, because a run
 * is either in `recentRuns` or it did not happen.
 *
 * Distances arrive in km and go through lib/units like every other distance.
 * Days are resolved here ONLY as ISO keys for matching runs; the labels are
 * weekday initials, not dates, so nothing on screen is a derived date.
 */
import { Fragment } from "react";
import { View } from "react-native";
import Svg, { Rect, Text as SvgText } from "react-native-svg";

import { localDay, localDayOffset } from "../lib/dates";
import { miNum } from "../lib/units";
import { useColors } from "../theme/tokens";
import { font } from "../theme/type";

const BAR_W = 30;
const HEIGHT = 96;
const LABEL_H = 22;
const VALUE_H = 16;
const DAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;

export function WeekBars({
  runs,
  width = 326,
}: {
  runs: { date: string; km: number }[];
  width?: number;
}) {
  const c = useColors();
  const today = localDay();
  // getDay() is Sunday-first; the team's week starts Monday.
  const dow = (new Date().getDay() + 6) % 7;
  const days = DAYS.map((label, i) => {
    const iso = localDayOffset(i - dow);
    const km = runs.filter((r) => r.date === iso).reduce((a, r) => a + r.km, 0);
    return { label, iso, mi: miNum(km, 1), future: iso > today, today: iso === today };
  });
  const max = Math.max(1, ...days.map((d) => d.mi));
  const plotH = HEIGHT - LABEL_H - VALUE_H;
  const gap = (width - DAYS.length * BAR_W) / (DAYS.length - 1);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={days
        .filter((d) => !d.future)
        .map((d) => `${d.label} ${d.mi} mi`)
        .join(", ")}
    >
      <Svg width={width} height={HEIGHT}>
        {days.map((d, i) => {
          const x = i * (BAR_W + gap);
          const h = d.mi > 0 ? Math.max(6, (plotH * d.mi) / max) : 3;
          const y = VALUE_H + plotH - h;
          const fill = d.today ? c.brand : d.mi > 0 ? c.ok : c.rule;
          return (
            <Fragment key={d.iso}>
              {d.future ? null : <Rect x={x} y={y} width={BAR_W} height={h} rx={6} fill={fill} />}
              {d.mi > 0 ? (
                <SvgText
                  x={x + BAR_W / 2}
                  y={y - 5}
                  textAnchor="middle"
                  fontFamily={font.monoBold}
                  fontSize={11}
                  fill={c.ink2}
                >
                  {d.mi}
                </SvgText>
              ) : null}
              <SvgText
                x={x + BAR_W / 2}
                y={HEIGHT - 6}
                textAnchor="middle"
                fontFamily={font.bodySemi}
                fontSize={12}
                fill={d.today ? c.brand : c.muted}
              >
                {d.label}
              </SvgText>
            </Fragment>
          );
        })}
      </Svg>
    </View>
  );
}
