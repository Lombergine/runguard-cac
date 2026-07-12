//
//  RiskCard.swift
//  RunGuard
//

import SwiftUI

/// Product-facing display metadata for zones. (ACWRDebugView deliberately
/// keeps its own private copies so it stays deletable in one piece.)
extension TrainingZone {
    var displayName: String {
        switch self {
        case .undertraining: "Undertraining"
        case .optimal: "Optimal Load"
        case .caution: "Caution"
        case .highRisk: "High Risk"
        }
    }

    /// Green / yellow / red banding. Orange stands in for yellow — pure
    /// yellow is illegible on a light background.
    var color: Color {
        switch self {
        case .optimal: .green
        case .undertraining, .caution: .orange
        case .highRisk: .red
        }
    }
}

/// The injury-risk headline above the run list. Rendering is a pure
/// function of ACWRStatus: the enum's cases force the cold-start and
/// no-baseline states to be designed, not defaulted.
struct RiskCard: View {
    let status: ACWRStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Label(title, systemImage: icon)
                    .font(.headline)
                    .foregroundStyle(accent)
                Spacer()
                if case .score(let ratio, _, _, _) = status {
                    Text(ratio, format: .number.precision(.fractionLength(2)))
                        .font(.title2.weight(.bold).monospacedDigit())
                        .foregroundStyle(accent)
                }
            }
            Text(explanation)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
        // Read the card as one sentence in VoiceOver instead of four fragments.
        .accessibilityElement(children: .combine)
    }

    private var title: String {
        switch status {
        case .lowConfidence: "Building Your Baseline"
        case .noRecentTraining: "No Recent Training"
        case .score(_, let zone, _, _): zone.displayName
        }
    }

    private var icon: String {
        switch status {
        case .lowConfidence: "hourglass"
        case .noRecentTraining: "zzz"
        case .score(_, let zone, _, _):
            switch zone {
            case .undertraining: "arrow.down.right.circle"
            case .optimal: "checkmark.circle"
            case .caution: "exclamationmark.circle"
            case .highRisk: "exclamationmark.triangle"
            }
        }
    }

    private var accent: Color {
        switch status {
        case .lowConfidence, .noRecentTraining: .secondary
        case .score(_, let zone, _, _): zone.color
        }
    }

    private var explanation: String {
        switch status {
        case .lowConfidence(let days):
            return "\(days) of \(ACWRService.minimumHistoryDays) days of history. Risk scores unlock once RunGuard has learned your normal training load."
        case .noRecentTraining:
            return "No runs in the last 4 weeks, so there's no baseline to compare against. Ease back in gradually."
        case .score(let ratio, let zone, _, _):
            // The ratio IS acute ÷ chronic, so its distance from 1.0 is the
            // percent change vs the 4-week average — no extra math needed.
            let delta = Int(((ratio - 1) * 100).rounded())
            let trend = if delta > 0 {
                "Acute load up \(delta)% vs your 4-week average."
            } else if delta < 0 {
                "Acute load down \(-delta)% vs your 4-week average."
            } else {
                "Acute load in line with your 4-week average."
            }
            let advice = switch zone {
            case .undertraining: "Room to build — ramp up gently."
            case .optimal: "You're in the sweet spot."
            case .caution: "Consider an easier week."
            case .highRisk: "Back off before your body does it for you."
            }
            return "\(trend) \(advice)"
        }
    }
}

#Preview("All states") {
    ScrollView {
        VStack(spacing: 12) {
            RiskCard(status: .score(ratio: 1.05, zone: .optimal, acuteLoad: 3.1, chronicLoad: 2.95))
            RiskCard(status: .score(ratio: 1.38, zone: .caution, acuteLoad: 4.1, chronicLoad: 2.97))
            RiskCard(status: .score(ratio: 1.72, zone: .highRisk, acuteLoad: 5.1, chronicLoad: 2.97))
            RiskCard(status: .score(ratio: 0.55, zone: .undertraining, acuteLoad: 1.6, chronicLoad: 2.9))
            RiskCard(status: .lowConfidence(daysOfHistory: 9))
            RiskCard(status: .noRecentTraining)
        }
        .padding()
    }
}
