//
//  HomeCharts.swift
//  RunGuard
//
//  Two pictures for the home screen, drawn with Swift Charts from the ACWR
//  engine's day-by-day series.
//
//  WorkloadChartCard: the product's central claim, drawn. The last 90 days
//  of the ratio in the one accent colour, the 0.8–1.3 band as a neutral wash
//  (not green: a band is a region of an axis, not a verdict), the universal
//  1.5 rule in muted ink, and, when personal zones are in use, the athlete's
//  own 90th and 95th percentile lines in violet. The word "ACWR" appears
//  nowhere on screen; the audience is fifteen.
//
//  WeeklyMilesCard: the last eight weeks of mileage, this week in coral.
//
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import Charts
import SwiftUI

struct WorkloadChartCard: View {
    let series: [ACWRPoint]
    let thresholds: ACWRThresholds
    let zoneSource: ZoneSource
    var days = 90

    private var points: [ACWRPoint] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -days, to: .now) ?? .distantPast
        return series.filter { $0.date >= cutoff && $0.ratio != nil && !$0.lowConfidence }
    }

    private var yMax: Double {
        let top = points.compactMap(\.ratio).max() ?? 1.5
        return max(2.1, min(4.0, (top + 0.2).rounded(.up)))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Workload ratio")
                    .font(Pulse.display(19))
                    .foregroundStyle(Pulse.ink)
                Spacer()
                Micro("last \(days) days")
            }
            Text("Your last 7 days against your last 28. A ratio has no unit.")
                .font(Pulse.body(13))
                .foregroundStyle(Pulse.muted)

            if points.count < 2 {
                HStack {
                    Text("—").font(Pulse.mono(22)).foregroundStyle(Pulse.unknown)
                    Text("not enough history for a picture yet")
                        .font(Pulse.body(13)).foregroundStyle(Pulse.muted)
                }
                .frame(maxWidth: .infinity, minHeight: 160, alignment: .center)
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Pulse.unknown, style: StrokeStyle(lineWidth: 1, dash: [3, 4])))
            } else {
                Chart {
                    RectangleMark(
                        yStart: .value("Band low", thresholds.undertrainingBelow),
                        yEnd: .value("Band high", thresholds.optimalBelow)
                    )
                    .foregroundStyle(Pulse.ink.opacity(0.06))

                    RuleMark(y: .value("Universal 1.5", 1.5))
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                        .foregroundStyle(Pulse.muted)
                        .annotation(position: .top, alignment: .trailing) {
                            Micro("1.5 universal").padding(.trailing, 2)
                        }

                    if zoneSource == .personalHistory {
                        RuleMark(y: .value("Your 95th", thresholds.cautionThrough))
                            .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [2, 3]))
                            .foregroundStyle(Pulse.series1)
                            .annotation(position: .bottom, alignment: .trailing) {
                                Micro("\(String(format: "%.2f", thresholds.cautionThrough)) yours", color: Pulse.series1Text).padding(.trailing, 2)
                            }
                    }

                    ForEach(points) { p in
                        LineMark(x: .value("Day", p.date), y: .value("Ratio", p.ratio ?? 0))
                            .interpolationMethod(.monotone)
                            .lineStyle(StrokeStyle(lineWidth: 2))
                            .foregroundStyle(Pulse.brand)
                    }
                    if let last = points.last, let r = last.ratio {
                        PointMark(x: .value("Day", last.date), y: .value("Ratio", r))
                            .symbolSize(60)
                            .foregroundStyle(Pulse.brand)
                    }
                }
                .chartYScale(domain: 0...yMax)
                .chartYAxis {
                    AxisMarks(position: .leading, values: [0, 0.5, 1.0, 1.5, 2.0]) { v in
                        AxisGridLine().foregroundStyle(Pulse.grid)
                        AxisValueLabel {
                            if let d = v.as(Double.self) {
                                Text(String(format: "%.1f", d)).font(Pulse.mono(10)).foregroundStyle(Pulse.muted)
                            }
                        }
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .stride(by: .month)) { _ in
                        AxisGridLine().foregroundStyle(Pulse.grid)
                        AxisValueLabel(format: .dateTime.month(.abbreviated))
                            .font(Pulse.mono(10)).foregroundStyle(Pulse.muted)
                    }
                }
                .frame(height: 170)
            }

            HStack(spacing: 14) {
                legend(Pulse.brand, "you", solid: true)
                legend(Pulse.ink.opacity(0.3), "0.8–1.3 band", solid: true)
                legend(Pulse.muted, "1.5 universal", solid: false)
                if zoneSource == .personalHistory { legend(Pulse.series1, "your 95th", solid: false) }
            }
            .font(Pulse.body(12))
            .foregroundStyle(Pulse.muted)
            Text("The band and the 1.5 line are the interpretation most apps apply to everyone. The self-audit below says how much of this line is just your mileage.")
                .font(Pulse.body(12))
                .foregroundStyle(Pulse.muted)
        }
        .pulseCard()
    }

    private func legend(_ color: Color, _ label: String, solid: Bool) -> some View {
        HStack(spacing: 5) {
            if solid {
                RoundedRectangle(cornerRadius: 1).fill(color).frame(width: 14, height: 3)
            } else {
                Rectangle().fill(color).frame(width: 14, height: 1.5).mask(
                    HStack(spacing: 2) { ForEach(0..<3) { _ in Rectangle().frame(width: 3) } }
                )
            }
            Text(label)
        }
    }
}

struct WeeklyMilesCard: View {
    let series: [ACWRPoint]
    var weeks = 8

    private struct Week: Identifiable {
        let id: Date
        let miles: Double
        let isCurrent: Bool
        var label: String { id.formatted(.dateTime.month(.abbreviated).day()) }
    }

    private var rows: [Week] {
        let cal = Calendar.current
        var byWeek: [Date: Double] = [:]
        for p in series {
            if let start = cal.dateInterval(of: .weekOfYear, for: p.date)?.start {
                byWeek[start, default: 0] += p.dailyLoad
            }
        }
        guard let thisWeek = cal.dateInterval(of: .weekOfYear, for: .now)?.start else { return [] }
        return (0..<weeks).reversed().compactMap { back in
            guard let start = cal.date(byAdding: .weekOfYear, value: -back, to: thisWeek) else { return nil }
            return Week(id: start, miles: byWeek[start] ?? 0, isCurrent: back == 0)
        }
    }

    var body: some View {
        let data = rows
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Weekly miles").font(Pulse.display(19)).foregroundStyle(Pulse.ink)
                Spacer()
                if let cur = data.last {
                    Text(String(format: "%.1f mi", cur.miles)).font(Pulse.mono(18, .semibold)).foregroundStyle(Pulse.brandText)
                }
            }
            Micro("this week so far, against the seven before it")
            Chart(data) { w in
                BarMark(x: .value("Week", w.label), y: .value("Miles", w.miles))
                    .foregroundStyle(w.isCurrent ? Pulse.brand : Pulse.ruleStrong)
                    .cornerRadius(3)
                    .annotation(position: .top) {
                        if w.miles > 0 {
                            Text(String(format: "%.0f", w.miles)).font(Pulse.mono(9)).foregroundStyle(Pulse.muted)
                        }
                    }
            }
            .chartYAxis(.hidden)
            .chartXAxis {
                AxisMarks { _ in
                    AxisValueLabel().font(Pulse.mono(9)).foregroundStyle(Pulse.muted)
                }
            }
            .frame(height: 120)
        }
        .pulseCard()
    }
}
