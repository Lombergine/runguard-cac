//
//  RiskCard.swift
//  RunGuard
//
//  The injury-risk headline above the run list. Rendering is a pure
//  function of ACWRStatus: the enum's cases force the cold-start and
//  no-baseline states to be designed, not defaulted.
//
//  Restyled for RunGuard 2.0 to the Pulse system (see Theme.swift): a ring
//  carrying the ratio, zone as a coloured word, the explanation in body
//  type, and no tinted fill. The original 1.x card logic (zone names,
//  explanation copy, the percent-change arithmetic) is unchanged.
//  AI-assisted restyle, see DISCLOSURE.md.
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

struct RiskCard: View {
    let status: ACWRStatus
    var zoneSource: ZoneSource = .coachSettings

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            Ring(fraction: ringFraction, color: accent) {
                VStack(spacing: 0) {
                    Text(ratioText)
                        .font(Pulse.mono(26, .semibold))
                        .foregroundStyle(ringFraction == nil ? Pulse.unknown : Pulse.ink)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Micro("ratio")
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                Micro(eyebrow)
                HStack(spacing: 6) {
                    Image(systemName: icon)
                    Text(title)
                }
                .font(Pulse.display(21))
                .foregroundStyle(accent)
                Text(explanation)
                    .font(Pulse.body(14))
                    .foregroundStyle(Pulse.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .pulseCard()
        // Read the card as one sentence in VoiceOver instead of four fragments.
        .accessibilityElement(children: .combine)
    }

    /// The ring fills to 2.0, the top of the range anyone monitors.
    private var ringFraction: Double? {
        if case .score(let ratio, _, _, _) = status { return min(ratio / 2.0, 1) }
        return nil
    }

    private var ratioText: String {
        if case .score(let ratio, _, _, _) = status { return String(format: "%.2f", ratio) }
        return "—"
    }

    private var eyebrow: String {
        let day = Date.now.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
        switch zoneSource {
        case .personalHistory: return "\(day) · your zones"
        case .coachSettings: return "\(day)"
        }
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
        case .lowConfidence, .noRecentTraining: Pulse.unknown
        case .score(_, let zone, _, _): zone.pulseText
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
            RiskCard(status: .score(ratio: 1.38, zone: .caution, acuteLoad: 4.1, chronicLoad: 2.97), zoneSource: .personalHistory)
            RiskCard(status: .score(ratio: 1.72, zone: .highRisk, acuteLoad: 5.1, chronicLoad: 2.97))
            RiskCard(status: .score(ratio: 0.55, zone: .undertraining, acuteLoad: 1.6, chronicLoad: 2.9))
            RiskCard(status: .lowConfidence(daysOfHistory: 9))
            RiskCard(status: .noRecentTraining)
        }
        .padding()
    }
    .background(Pulse.bg)
}
