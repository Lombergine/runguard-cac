//
//  SorenessCard.swift
//  RunGuard
//

import SwiftUI

/// The recurring-complaint headline, shown under the ACWR card and only when
/// there is something to say.
///
/// Deliberately separate from RiskCard: load and pain answer different
/// questions. ACWR can sit at a clean 1.0 while an athlete reports the same
/// shin on six straight runs, and that athlete is the one to pull aside.
struct SorenessCard: View {
    let report: SorenessReport

    var body: some View {
        if report.hasFlags {
            VStack(alignment: .leading, spacing: 10) {
                Label("Recurring Soreness", systemImage: "bandage")
                    .font(.headline)
                    .foregroundStyle(accent)

                ForEach(report.flags) { flag in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(flag.area.label)
                                .font(.subheadline.weight(.semibold))
                            Spacer()
                            Text("\(flag.latestSeverity)/10")
                                .font(.subheadline.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                        Text(sentence(for: flag))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    /// Orange for a complaint that is easing or holding, red once anything is
    /// rising or showing up on every run — same banding language as RiskCard.
    private var accent: Color {
        let urgent = report.flags.contains { $0.trend == .rising || $0.isConsecutive }
        return urgent ? .red : .orange
    }

    private func sentence(for flag: SorenessFlag) -> String {
        let frequency = flag.isConsecutive
            ? "Every run since \(flag.firstReported.formatted(.dateTime.month(.abbreviated).day()))"
            : "\(flag.reports) of your last \(flag.runsLogged) logged runs"
        let peak = flag.peakSeverity > flag.latestSeverity
            ? " Peaked at \(flag.peakSeverity)/10."
            : ""
        return "\(frequency), \(flag.trend.label).\(peak)"
    }
}

#Preview("Flags") {
    ScrollView {
        VStack(spacing: 12) {
            SorenessCard(report: SorenessReport(
                flags: [
                    SorenessFlag(
                        area: .shin, reports: 5, runsLogged: 5,
                        firstReported: .now.addingTimeInterval(-12 * 86_400),
                        lastReported: .now.addingTimeInterval(-86_400),
                        latestSeverity: 7, peakSeverity: 7, averageSeverity: 5.2,
                        trend: .rising, isConsecutive: true
                    ),
                    SorenessFlag(
                        area: .knee, reports: 3, runsLogged: 5,
                        firstReported: .now.addingTimeInterval(-18 * 86_400),
                        lastReported: .now.addingTimeInterval(-4 * 86_400),
                        latestSeverity: 3, peakSeverity: 6, averageSeverity: 4.3,
                        trend: .easing, isConsecutive: false
                    )
                ],
                windowDays: 21, runsLogged: 5
            ))
            SorenessCard(report: .empty)
        }
        .padding()
    }
}
