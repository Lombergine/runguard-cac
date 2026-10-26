//
//  InsightsService.swift
//  RunGuard
//
//  Runs the RunGuard 2.0 statistics over the daily load series the existing
//  ACWR engine already builds: the data-quality pre-flight, the personal
//  threshold report, and the self-audit (how much of the score is just the
//  last seven days). All math lives in RunGuardCore, which is tested against
//  the Python `acwr` reference; this file only adapts the app's types.
//
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import Foundation
import RunGuardCore

/// Everything the 2.0 cards show, computed from one daily load series.
nonisolated struct LoadInsights: Equatable, Sendable {
    /// Start of the first day in `dailyLoad`.
    let startDay: Date
    /// Miles per calendar day, rest days as explicit zeros, oldest first.
    let dailyLoad: [Double]
    let quality: LoadQuality
    /// Nil while the series is shorter than the 28-day warm-up.
    let threshold: ThresholdReport?
    /// Nil while fewer than three days carry a ratio.
    let audit: RescalingResult?

    /// Days that carry a ratio once the warm-up is taken out.
    var usableDays: Int { threshold?.n ?? 0 }

    /// Below this the personal percentiles are computable but not worth
    /// acting on, so the app keeps the published cut points.
    static let personalZonesMinimumDays = Diagnostics.recommendedUsableDays

    var hasEnoughHistoryForPersonalZones: Bool {
        usableDays >= Self.personalZonesMinimumDays
    }

    /// Zone cut points learned from this athlete's own ratio distribution:
    /// caution starts at their 90th percentile, high risk above their 95th.
    /// The undertraining line is left where the coach set it. Returns nil
    /// until there is enough history.
    func personalZones(basedOn base: ACWRThresholds) -> ACWRThresholds? {
        guard hasEnoughHistoryForPersonalZones, let t = threshold,
              let p90 = t.percentile(90), let p95 = t.percentile(95),
              p90.isFinite, p95.isFinite else { return nil }
        return ACWRThresholds(
            undertrainingBelow: base.undertrainingBelow,
            optimalBelow: p90,
            cautionThrough: p95
        ).normalized()
    }

    func date(ofDay index: Int, calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .day, value: index, to: startDay) ?? startDay
    }
}

/// Which cut points the risk card is currently colouring with.
nonisolated enum ZoneSource: Equatable, Sendable {
    /// The published defaults, or whatever the coach dialled in.
    case coachSettings
    /// Learned from the athlete's own history (60+ usable days).
    case personalHistory
}

nonisolated enum InsightsService {
    /// Bootstrap resamples on device. The reference uses 2000; 500 keeps the
    /// interval stable to two decimals and finishes in about a second.
    static let onDeviceBootstrapDraws = 500
    static let bootstrapSeed: UInt64 = 0

    /// Compute every insight from the ACWR engine's day-by-day series.
    /// `bootstrapDraws: 0` skips the confidence interval (reported as NaN)
    /// so the point estimates can be shown immediately and the interval
    /// filled in from a background task.
    static func compute(series: [ACWRPoint], bootstrapDraws: Int) -> LoadInsights? {
        guard let first = series.first else { return nil }
        let load = series.map(\.dailyLoad)
        return LoadInsights(
            startDay: first.date,
            dailyLoad: load,
            quality: Quality.checkLoad(load),
            // Errors here mean "not enough history", which the cards state
            // explicitly, so they are reported as nil rather than thrown.
            threshold: try? Diagnostics.thresholdFromHistory(load),
            audit: try? Diagnostics.rescalingCheck(load, draws: bootstrapDraws, seed: bootstrapSeed)
        )
    }
}
