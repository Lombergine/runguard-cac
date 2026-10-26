//
//  InsightCards.swift
//  RunGuard
//
//  The RunGuard 2.0 cards under the risk card:
//
//  - ThresholdCard: what the universal 1.5 cutoff picks out of this
//    athlete's own history, their own 95th percentile, and which cut points
//    are colouring the risk card right now.
//  - AuditCard: the self-audit. How closely the score tracks the last seven
//    days on its own (Impellizzeri et al. 2021), with a bootstrap interval.
//  - GaitCard: the second risk channel. Ground contact time and vertical
//    oscillation this week against the athlete's own four-week baseline,
//    plus a two-axis view of load risk against mechanical drift.
//  - DataQualityCard: the pre-flight warnings, with dates.
//
//  Every number comes from RunGuardCore; nothing here computes statistics.
//  Rendering follows RiskCard: a pure function of the model, with the
//  "not enough history" states designed rather than defaulted.
//
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import RunGuardCore
import SwiftUI

/// The 2.0 rows for the risk section of the run list. A Group so each card
/// is its own list row with the same chrome as RiskCard.
struct InsightRows: View {
    @Bindable var viewModel: WorkoutListViewModel
    let risk: ACWRStatus

    var body: some View {
        Group {
            ThresholdCard(
                insights: viewModel.insights,
                effectiveThresholds: viewModel.effectiveThresholds,
                zoneSource: viewModel.zoneSource
            )
            AuditCard(insights: viewModel.insights)
            GaitCard(
                display: viewModel.gaitForDisplay,
                showSample: $viewModel.showGaitSample,
                risk: risk,
                thresholds: viewModel.effectiveThresholds
            )
            if let insights = viewModel.insights,
               !insights.quality.warnings.isEmpty || !insights.quality.errors.isEmpty {
                DataQualityCard(insights: insights)
            }
        }
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }
}

// MARK: - Shared chrome

/// Same shape as RiskCard: label, headline number, explanation, expandable
/// detail. Tapping the chevron reveals the longer explanation and citation.
private struct InsightCard<Detail: View>: View {
    let title: String
    let systemImage: String
    let accent: Color
    var badge: String? = nil
    let headline: String?
    let summary: String
    @ViewBuilder let detail: () -> Detail
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Label(title, systemImage: systemImage)
                    .font(.headline)
                    .foregroundStyle(accent)
                if let badge {
                    Text(badge)
                        .font(.caption2.weight(.heavy))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.orange, in: Capsule())
                        .foregroundStyle(.white)
                        .accessibilityLabel("Sample data")
                }
                Spacer()
                if let headline {
                    Text(headline)
                        .font(.title3.weight(.bold).monospacedDigit())
                        .foregroundStyle(accent)
                }
            }
            Text(summary)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if expanded {
                detail()
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
                    .transition(.opacity)
            }
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { expanded.toggle() }
            } label: {
                Label(expanded ? "Less" : "How this is computed",
                      systemImage: expanded ? "chevron.up" : "chevron.down")
                    .font(.caption.weight(.semibold))
                    .labelStyle(.titleAndIcon)
            }
            .buttonStyle(.plain)
            .foregroundStyle(accent)
            .padding(.top, 2)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
    }
}

private func f2(_ x: Double) -> String { String(format: "%.2f", x) }
private func pct1(_ fraction: Double) -> String { String(format: "%.1f%%", fraction * 100) }
private func ordinal(_ p: Double) -> String {
    let r = (p * 10).rounded() / 10
    let s = r == r.rounded() ? String(Int(r)) : String(format: "%.1f", r)
    let n = Int(r.rounded(.down)) % 100
    let suffix: String
    if (11...13).contains(n) { suffix = "th" } else {
        switch n % 10 {
        case 1: suffix = "st"
        case 2: suffix = "nd"
        case 3: suffix = "rd"
        default: suffix = "th"
        }
    }
    return s + suffix
}

// MARK: - Personal threshold

struct ThresholdCard: View {
    let insights: LoadInsights?
    let effectiveThresholds: ACWRThresholds
    let zoneSource: ZoneSource

    var body: some View {
        InsightCard(
            title: "Your Threshold",
            systemImage: "person.crop.circle.badge.checkmark",
            accent: .indigo,
            headline: headline,
            summary: summary
        ) {
            VStack(alignment: .leading, spacing: 6) {
                if let t = insights?.threshold {
                    Text("Your ratio distribution over \(t.n) days with a score:")
                    HStack(spacing: 14) {
                        ForEach([50.0, 75, 90, 95, 99], id: \.self) { p in
                            VStack(spacing: 2) {
                                Text("\(Int(p))th").font(.caption2)
                                Text(t.percentile(p).map(f2) ?? "—").monospacedDigit().fontWeight(.semibold)
                            }
                        }
                    }
                }
                Text("Every running app applies 1.5 to everyone: the same cutoff for a marathoner in a base block and a sprinter in season, taken from Gabbett (2016). RunGuard reports what 1.5 actually picks out of your own history and what cut would flag your hardest 5% of days instead.")
                Text("Honest note: a threshold chosen from your own distribution flags a fixed share of your days by construction, whatever your training was like. It makes the universal number's arbitrariness visible; it is not a validated predictor of injury.")
                Text("Gabbett, T. J. (2016). The training–injury prevention paradox. BJSM 50(5), 273–280.")
                    .italic()
            }
        }
    }

    private var headline: String? {
        insights?.threshold?.percentile(95).map(f2)
    }

    private var summary: String {
        guard let insights else {
            return "No runs yet, so there is no history to learn a threshold from."
        }
        guard let t = insights.threshold else {
            return "A personal threshold needs 28 days of history before the first ratio exists. You have \(insights.dailyLoad.count)."
        }
        let p95 = t.percentile(95).map(f2) ?? "—"
        var text = "The universal 1.5 cutoff flags \(pct1(t.referenceFlaggedFraction)) of your days (your \(ordinal(t.referencePercentile)) percentile). Your personal 95th percentile is \(p95)."
        switch zoneSource {
        case .personalHistory:
            text += " Zones in use: yours — caution from \(f2(effectiveThresholds.optimalBelow)), high risk above \(f2(effectiveThresholds.cautionThrough))."
        case .coachSettings:
            if insights.hasEnoughHistoryForPersonalZones {
                text += " Zones in use: the set in Settings (\(f2(effectiveThresholds.optimalBelow)) / \(f2(effectiveThresholds.cautionThrough))); personal zones are switched off."
            } else {
                text += " Zones in use: the published \(f2(effectiveThresholds.optimalBelow)) / \(f2(effectiveThresholds.cautionThrough)) until \(LoadInsights.personalZonesMinimumDays) days carry a score (you have \(t.n))."
            }
        }
        return text
    }
}

// MARK: - Self-audit

struct AuditCard: View {
    let insights: LoadInsights?

    var body: some View {
        InsightCard(
            title: "Self-Audit",
            systemImage: "checkmark.seal",
            accent: .teal,
            headline: headline,
            summary: summary
        ) {
            VStack(alignment: .leading, spacing: 6) {
                Text("The ratio is acute load divided by chronic load. If the chronic denominator barely changes the ordering of days, the ratio is a rescaled copy of its own numerator and the 4-week baseline is doing no work. Impellizzeri and colleagues showed in 2021 that replacing the denominator with noise left the ratio's link to injury about the same. This card runs the label-free version of that test on your own data: the Spearman rank correlation between the score and your last 7 days alone.")
                if let a = insights?.audit {
                    Text("n = \(a.n) days with a score, method: \(a.method.displayName). Interval: percentile bootstrap, \(a.bootstrapDraws) resamples, fixed seed, so it is the same every time.")
                }
                Text("Impellizzeri, F. M., Woodcock, S., Coutts, A. J., Fanchini, M., McCall, A., & Vigotsky, A. D. (2021). What role do chronic workloads play in the acute to chronic workload ratio? Time to dismiss ACWR and its underlying theory. Sports Medicine, 51(3), 581–592.")
                    .italic()
            }
        }
    }

    private var headline: String? {
        guard let a = insights?.audit, (insights?.usableDays ?? 0) >= Diagnostics.recommendedUsableDays else { return nil }
        return "ρ \(f2(a.spearman))"
    }

    private var summary: String {
        guard let insights else { return "No runs yet, so there is nothing to audit." }
        guard let a = insights.audit else {
            return "The audit needs days that carry a score. You have \(insights.usableDays); it unlocks at \(Diagnostics.recommendedUsableDays)."
        }
        guard insights.usableDays >= Diagnostics.recommendedUsableDays else {
            return "The audit unlocks at \(Diagnostics.recommendedUsableDays) days with a score; you have \(a.n). Below that the number moves too much to mean anything."
        }
        let ci = a.spearmanCILow.isNaN
            ? "interval computing…"
            : "CI \(f2(a.spearmanCILow)) to \(f2(a.spearmanCIHigh))"
        let verdict: String
        if a.spearman >= 0.9 {
            verdict = "Above 0.9 the score is mostly repeating your weekly mileage."
        } else if a.spearman >= 0.7 {
            verdict = "Most of this score's movement is your last 7 days; the 4-week baseline adds some."
        } else {
            verdict = "Below 0.7 the 4-week baseline is doing real work in this score."
        }
        return "This score tracks your last 7 days at ρ = \(f2(a.spearman)) (\(ci)). \(verdict)"
    }
}

// MARK: - Gait channel

struct GaitCard: View {
    let display: (analysis: GaitAnalysis, isSample: Bool)?
    @Binding var showSample: Bool
    let risk: ACWRStatus
    let thresholds: ACWRThresholds

    var body: some View {
        InsightCard(
            title: title,
            systemImage: "figure.run.motion",
            accent: accent,
            badge: display?.isSample == true ? "SAMPLE DATA" : nil,
            headline: headline,
            summary: summary
        ) {
            VStack(alignment: .leading, spacing: 8) {
                if case .analyzed(let d)? = display?.analysis {
                    RiskQuadrant(risk: risk, thresholds: thresholds, drift: d)
                        .frame(height: 170)
                        .padding(.vertical, 4)
                    metricsTable(d)
                }
                Text("Load alone is yesterday's model. The gait channel compares this week's mean ground contact time and vertical oscillation, read per run from Apple Watch running dynamics in Health, against the median of the four weeks before it. It flags mechanical drift when contact time rises more than 5% or oscillation more than 8% without a pace increase that would explain it. The baseline window ends before this week begins, so a drifting week cannot pull its own baseline toward itself.")
                Text("These thresholds are heuristics chosen for this app, not clinically validated cut points. Treat a flag as a reason to pay attention, not a diagnosis.")
                if display?.isSample == true {
                    Text("Sample data: six generated weeks of runs, four a week, with a 6% contact-time rise in the final week at unchanged pace. Shown because this device's Health store has no running-dynamics samples.")
                        .foregroundStyle(.orange)
                }
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if showToggle {
                Toggle("Sample data", isOn: $showSample)
                    .toggleStyle(.switch)
                    .labelsHidden()
                    .padding(12)
                    .accessibilityLabel("Show sample gait data")
            }
        }
    }

    /// Offer the sample only when Health has nothing to show.
    private var showToggle: Bool {
        if showSample { return true }
        if case .noDynamics? = display?.analysis { return true }
        return false
    }

    private var title: String {
        guard case .analyzed(let d)? = display?.analysis else { return "Gait" }
        return d.flagsMechanicalDrift ? "Mechanical Drift" : "Gait Steady"
    }

    private var accent: Color {
        guard case .analyzed(let d)? = display?.analysis else { return .secondary }
        return d.flagsMechanicalDrift ? .red : .green
    }

    private var headline: String? {
        guard case .analyzed(let d)? = display?.analysis, let g = d.groundContactDrift else { return nil }
        return (g >= 0 ? "+" : "") + pct1(g)
    }

    private var summary: String {
        guard let display else { return "Reading running dynamics from Health…" }
        switch display.analysis {
        case .noDynamics:
            return "No running-dynamics samples in Apple Health. Garmin and most third-party watches sync distance and heart rate but not gait metrics; Apple Watch Series 7 or later on watchOS 9+ records them on every outdoor run. Switch on sample data to see what the channel shows."
        case .insufficientBaseline(let runs, let needed):
            return "A baseline needs \(needed) runs with dynamics in the four weeks before this one; found \(runs)."
        case .noRecentRuns:
            return "A baseline exists, but no run with dynamics in the last 7 days to compare against it."
        case .analyzed(let d):
            var parts: [String] = []
            if let r = d.recentGroundContactMs, let b = d.baselineGroundContactMs, let g = d.groundContactDrift {
                parts.append("Ground contact \(Int(r.rounded())) ms, \(describe(g, threshold: Gait.groundContactDriftThreshold)) vs. your 4-week baseline of \(Int(b.rounded())) ms.")
            }
            if let r = d.recentVerticalOscillationCm, let b = d.baselineVerticalOscillationCm, let v = d.verticalOscillationDrift {
                parts.append("Vertical oscillation \(String(format: "%.1f", r)) cm, \(describe(v, threshold: Gait.verticalOscillationDriftThreshold)) vs. \(String(format: "%.1f", b)) cm.")
            }
            if let s = d.speedChange {
                parts.append("Pace \(abs(s) <= Gait.paceTolerance ? "unchanged" : (s > 0 ? "\(pct1(s)) faster" : "\(pct1(-s)) slower")).")
            }
            return parts.joined(separator: " ")
        }
    }

    private func describe(_ drift: Double, threshold: Double) -> String {
        if drift > threshold { return "up \(pct1(drift))" }
        if drift < -threshold { return "down \(pct1(-drift))" }
        return "steady (\(drift >= 0 ? "+" : "")\(pct1(drift)))"
    }

    private func metricsTable(_ d: GaitDrift) -> some View {
        Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 4) {
            GridRow {
                Text("").gridColumnAlignment(.leading)
                Text("4-wk baseline").fontWeight(.semibold)
                Text("This week").fontWeight(.semibold)
                Text("Change").fontWeight(.semibold)
            }
            GridRow {
                Text("Ground contact")
                Text(d.baselineGroundContactMs.map { "\(Int($0.rounded())) ms" } ?? "—")
                Text(d.recentGroundContactMs.map { "\(Int($0.rounded())) ms" } ?? "—")
                Text(d.groundContactDrift.map { ($0 >= 0 ? "+" : "") + pct1($0) } ?? "—")
            }
            GridRow {
                Text("Vertical osc.")
                Text(d.baselineVerticalOscillationCm.map { String(format: "%.1f cm", $0) } ?? "—")
                Text(d.recentVerticalOscillationCm.map { String(format: "%.1f cm", $0) } ?? "—")
                Text(d.verticalOscillationDrift.map { ($0 >= 0 ? "+" : "") + pct1($0) } ?? "—")
            }
            GridRow {
                Text("Speed")
                Text(d.baselineSpeed.map { String(format: "%.2f m/s", $0) } ?? "—")
                Text(d.recentSpeed.map { String(format: "%.2f m/s", $0) } ?? "—")
                Text(d.speedChange.map { ($0 >= 0 ? "+" : "") + pct1($0) } ?? "—")
            }
            GridRow {
                Text("Runs")
                Text("\(d.baselineRuns)")
                Text("\(d.recentRuns)")
                Text("")
            }
        }
        .font(.caption.monospacedDigit())
    }
}

/// Load risk on one axis, mechanical drift on the other. Four quadrants with
/// plain labels; the dot is this week. The vertical line is the caution cut
/// point in use, the horizontal line is the 5% contact-time drift threshold.
struct RiskQuadrant: View {
    let risk: ACWRStatus
    let thresholds: ACWRThresholds
    let drift: GaitDrift

    private let ratioRange = 0.5...2.0
    private let driftRange = -0.10...0.15

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let xCut = w * unit(thresholds.optimalBelow, in: ratioRange)
            let yCut = h * (1 - unit(Gait.groundContactDriftThreshold, in: driftRange))
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 8).fill(Color(.secondarySystemBackground))
                Path { p in
                    p.move(to: CGPoint(x: xCut, y: 0)); p.addLine(to: CGPoint(x: xCut, y: h))
                    p.move(to: CGPoint(x: 0, y: yCut)); p.addLine(to: CGPoint(x: w, y: yCut))
                }
                .stroke(Color.secondary.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                quadrantLabel("Fresh, steady", x: 0, y: h, anchor: .bottomLeading)
                quadrantLabel("Load up, gait steady", x: w, y: h, anchor: .bottomTrailing)
                quadrantLabel("Gait drifting, load fine", x: 0, y: 0, anchor: .topLeading)
                quadrantLabel("Both: ease off", x: w, y: 0, anchor: .topTrailing)
                if let ratio = currentRatio, let g = drift.groundContactDrift {
                    let x = w * unit(ratio, in: ratioRange)
                    let y = h * (1 - unit(g, in: driftRange))
                    Circle()
                        .fill(dotColor(ratio: ratio, drift: g))
                        .frame(width: 14, height: 14)
                        .overlay(Circle().stroke(.white, lineWidth: 2))
                        .position(x: x, y: y)
                        .accessibilityLabel("This week: ratio \(f2(ratio)), contact time \(pct1(g))")
                }
                Text("load →").font(.caption2).foregroundStyle(.secondary)
                    .position(x: w / 2, y: h - 8)
                Text("gait drift ↑").font(.caption2).foregroundStyle(.secondary)
                    .rotationEffect(.degrees(-90))
                    .position(x: 10, y: h / 2)
            }
        }
    }

    private var currentRatio: Double? {
        if case .score(let ratio, _, _, _) = risk { return ratio }
        return nil
    }

    private func unit(_ v: Double, in r: ClosedRange<Double>) -> CGFloat {
        CGFloat(min(max((v - r.lowerBound) / (r.upperBound - r.lowerBound), 0.03), 0.97))
    }

    private func dotColor(ratio: Double, drift: Double) -> Color {
        let loadUp = ratio >= thresholds.optimalBelow
        let gaitUp = drift > Gait.groundContactDriftThreshold
        switch (loadUp, gaitUp) {
        case (true, true): return .red
        case (false, false): return .green
        default: return .orange
        }
    }

    private func quadrantLabel(_ text: String, x: CGFloat, y: CGFloat, anchor: UnitPoint) -> some View {
        Text(text)
            .font(.caption2.weight(.medium))
            .foregroundStyle(.secondary)
            .padding(6)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: Alignment(horizontal: anchor.x == 0 ? .leading : .trailing, vertical: anchor.y == 0 ? .top : .bottom))
            .padding(.horizontal, 14)
    }
}

// MARK: - Data quality

struct DataQualityCard: View {
    let insights: LoadInsights

    var body: some View {
        InsightCard(
            title: insights.quality.ok ? "Data Check" : "Not Enough History",
            systemImage: insights.quality.ok ? "exclamationmark.triangle" : "xmark.octagon",
            accent: insights.quality.ok ? .orange : .red,
            headline: nil,
            summary: "\(insights.quality.nDays) days, \(insights.quality.nTrainingDays) with a run. \(insights.quality.errors.count) error(s), \(insights.quality.warnings.count) warning(s). Nothing is corrected automatically; whether a gap was rest or an unsynced watch is your call."
        ) {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(insights.quality.errors + insights.quality.warnings) { f in
                    HStack(alignment: .top, spacing: 6) {
                        Image(systemName: f.severity == .error ? "xmark.octagon.fill" : "exclamationmark.triangle.fill")
                            .foregroundStyle(f.severity == .error ? .red : .orange)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(f.message)
                            if !f.dayIndices.isEmpty {
                                Text(f.dayIndices.map { insights.date(ofDay: $0).formatted(.dateTime.month(.abbreviated).day().year()) }.joined(separator: ", "))
                                    .foregroundStyle(.tertiary)
                            }
                        }
                    }
                }
                Text("Checks: history shorter than the 28-day window, no training, outlier days (over 3× your 95th-percentile day: the watch-left-running case), breaks of 10+ zero days (the ratio after a break is dominated by the break), and suspected unit changes.")
            }
        }
    }
}

#Preview("Cards") {
    let runs = SampleGaitData.sixWeeksWithDrift()
    ScrollView {
        VStack(spacing: 12) {
            AuditCard(insights: nil)
            ThresholdCard(insights: nil, effectiveThresholds: .standard, zoneSource: .coachSettings)
            GaitCard(
                display: (Gait.analyze(runs: runs), true),
                showSample: .constant(true),
                risk: .score(ratio: 1.38, zone: .caution, acuteLoad: 4.1, chronicLoad: 2.97),
                thresholds: .standard
            )
            GaitCard(display: (.noDynamics, false), showSample: .constant(false), risk: .noRecentTraining, thresholds: .standard)
        }
        .padding()
    }
}
