//
//  Gait.swift
//  RunGuardCore
//
//  A second risk channel, independent of training load: running mechanics.
//  Apple Watch (watchOS 9+) records ground contact time and vertical
//  oscillation for every outdoor run. The 2026 literature on wearable injury
//  prediction finds that the biomechanical features that carry signal are
//  temporal gait parameters and asymmetry, not load alone.
//
//  The model here is deliberately simple and described as a heuristic:
//  compare this week's mean ground contact time and vertical oscillation
//  against the median of the four weeks before it, and flag "mechanical
//  drift" when contact time rises more than 5% or oscillation more than 8%
//  while pace is not faster. Slower running lengthens ground contact on its
//  own, so the pace guard keeps an easy week from reading as a gait change.
//  The baseline window ends before the recent window begins (uncoupled), so
//  a drifting week cannot pull its own baseline toward itself.
//
//  Thresholds are not clinically validated. They are stated as such in the
//  UI and in the submission.
//
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import Foundation

/// Per-run running-dynamics summary, flattened from HealthKit samples.
public struct GaitRun: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let date: Date
    /// Mean ground contact time over the run, in milliseconds.
    public let groundContactMs: Double?
    public let groundContactSDMs: Double?
    /// Mean vertical oscillation over the run, in centimetres.
    public let verticalOscillationCm: Double?
    public let verticalOscillationSDCm: Double?
    /// Mean running speed in metres per second, from the workout's distance
    /// and duration when no speed samples exist.
    public let speedMetersPerSecond: Double?
    /// How many dynamics samples backed the means.
    public let sampleCount: Int

    public init(
        id: UUID = UUID(), date: Date,
        groundContactMs: Double?, groundContactSDMs: Double? = nil,
        verticalOscillationCm: Double?, verticalOscillationSDCm: Double? = nil,
        speedMetersPerSecond: Double?, sampleCount: Int
    ) {
        self.id = id
        self.date = date
        self.groundContactMs = groundContactMs
        self.groundContactSDMs = groundContactSDMs
        self.verticalOscillationCm = verticalOscillationCm
        self.verticalOscillationSDCm = verticalOscillationSDCm
        self.speedMetersPerSecond = speedMetersPerSecond
        self.sampleCount = sampleCount
    }

    /// True when the run carries at least one dynamics value.
    public var hasDynamics: Bool { groundContactMs != nil || verticalOscillationCm != nil }
}

/// This week's mechanics against the athlete's own baseline.
public struct GaitDrift: Sendable, Equatable {
    public let baselineRuns: Int
    public let recentRuns: Int

    public let baselineGroundContactMs: Double?
    public let recentGroundContactMs: Double?
    /// (recent - baseline) / baseline. Positive means longer contact.
    public let groundContactDrift: Double?

    public let baselineVerticalOscillationCm: Double?
    public let recentVerticalOscillationCm: Double?
    public let verticalOscillationDrift: Double?

    public let baselineSpeed: Double?
    public let recentSpeed: Double?
    /// (recent - baseline) / baseline. Positive means faster.
    public let speedChange: Double?

    /// True when either metric drifted past its threshold without a pace
    /// increase that would explain it.
    public let flagsMechanicalDrift: Bool
    /// Why, in words a runner can read.
    public let reasons: [String]
}

public enum GaitAnalysis: Sendable, Equatable {
    /// No run in the window carried running-dynamics samples.
    case noDynamics
    /// Fewer baseline runs than the minimum.
    case insufficientBaseline(runs: Int, needed: Int)
    /// A baseline exists but nothing ran in the last week.
    case noRecentRuns
    case analyzed(GaitDrift)
}

public enum Gait {
    public static let recentWindowDays = 7
    public static let baselineWindowDays = 28
    public static let minimumBaselineRuns = 4
    /// Heuristic thresholds. Not clinically validated.
    public static let groundContactDriftThreshold = 0.05
    public static let verticalOscillationDriftThreshold = 0.08
    /// Pace faster than this fraction over baseline explains a mechanics
    /// change on its own, so no flag is raised.
    public static let paceTolerance = 0.02

    public static func analyze(
        runs: [GaitRun], asOf now: Date = .now, calendar: Calendar = .current
    ) -> GaitAnalysis {
        let today = calendar.startOfDay(for: now)
        let recentStart = calendar.date(byAdding: .day, value: -(recentWindowDays - 1), to: today)!
        let baselineEnd = calendar.date(byAdding: .day, value: -1, to: recentStart)!
        let baselineStart = calendar.date(byAdding: .day, value: -(baselineWindowDays - 1), to: baselineEnd)!

        let withDynamics = runs.filter(\.hasDynamics)
        guard !withDynamics.isEmpty else { return .noDynamics }

        let baseline = withDynamics.filter {
            let d = calendar.startOfDay(for: $0.date)
            return d >= baselineStart && d <= baselineEnd
        }
        guard baseline.count >= minimumBaselineRuns else {
            return .insufficientBaseline(runs: baseline.count, needed: minimumBaselineRuns)
        }
        let recent = withDynamics.filter { calendar.startOfDay(for: $0.date) >= recentStart && calendar.startOfDay(for: $0.date) <= today }
        guard !recent.isEmpty else { return .noRecentRuns }

        func median(_ xs: [Double?]) -> Double? {
            let v = xs.compactMap { $0 }
            return v.isEmpty ? nil : Statistics.median(v)
        }
        func mean(_ xs: [Double?]) -> Double? {
            let v = xs.compactMap { $0 }
            return v.isEmpty ? nil : Statistics.mean(v)
        }
        func drift(_ recent: Double?, _ base: Double?) -> Double? {
            guard let recent, let base, base > 0 else { return nil }
            return (recent - base) / base
        }

        let bGCT = median(baseline.map(\.groundContactMs))
        let rGCT = mean(recent.map(\.groundContactMs))
        let bVO = median(baseline.map(\.verticalOscillationCm))
        let rVO = mean(recent.map(\.verticalOscillationCm))
        let bSpeed = median(baseline.map(\.speedMetersPerSecond))
        let rSpeed = mean(recent.map(\.speedMetersPerSecond))

        let gctDrift = drift(rGCT, bGCT)
        let voDrift = drift(rVO, bVO)
        let speedChange = drift(rSpeed, bSpeed)

        // A faster week lengthens stride and shortens contact; a slower one
        // does the opposite. Only a drift that pace does not explain counts.
        let paceExplains = (speedChange ?? 0) > paceTolerance
        var reasons: [String] = []
        if let g = gctDrift, g > groundContactDriftThreshold {
            reasons.append("Ground contact time up \(pct(g)) vs. your 4-week baseline")
        }
        if let v = voDrift, v > verticalOscillationDriftThreshold {
            reasons.append("Vertical oscillation up \(pct(v)) vs. your 4-week baseline")
        }
        var flags = !reasons.isEmpty
        if flags, paceExplains {
            flags = false
            reasons.append("Pace is \(pct(speedChange!)) faster this week, which can explain the change on its own")
        } else if flags, speedChange == nil {
            reasons.append("No pace data to rule out a change in effort")
        }

        return .analyzed(GaitDrift(
            baselineRuns: baseline.count, recentRuns: recent.count,
            baselineGroundContactMs: bGCT, recentGroundContactMs: rGCT, groundContactDrift: gctDrift,
            baselineVerticalOscillationCm: bVO, recentVerticalOscillationCm: rVO, verticalOscillationDrift: voDrift,
            baselineSpeed: bSpeed, recentSpeed: rSpeed, speedChange: speedChange,
            flagsMechanicalDrift: flags, reasons: reasons
        ))
    }

    static func pct(_ fraction: Double) -> String {
        String(format: "%.1f%%", fraction * 100)
    }
}

/// A clearly labelled sample dataset for devices whose Health store carries
/// no running-dynamics samples (Garmin and most third-party watches write
/// distance and heart rate to Health but not gait metrics). Deterministic,
/// so the demo shows the same numbers every time. Never presented as real.
public enum SampleGaitData {
    /// Six weeks of runs, four per week, with a steady baseline and a
    /// mechanics drift in the final week at unchanged pace: contact time up
    /// about 6%, oscillation up about 3%.
    public static func sixWeeksWithDrift(asOf now: Date = .now, calendar: Calendar = .current) -> [GaitRun] {
        let today = calendar.startOfDay(for: now)
        var runs: [GaitRun] = []
        var rng = SplitMix64(seed: 2026)
        func jitter(_ scale: Double) -> Double {
            (Double(rng.next() % 2001) / 1000.0 - 1.0) * scale
        }
        // Runs on days 41, 39, 37, 35 ... back from today: four per week.
        for daysAgo in stride(from: 41, through: 0, by: -1) where daysAgo % 7 == 6 || daysAgo % 7 == 4 || daysAgo % 7 == 2 || daysAgo % 7 == 0 {
            let date = calendar.date(byAdding: .day, value: -daysAgo, to: today)!
            let inDriftWeek = daysAgo < 7
            let gct = (inDriftWeek ? 268.0 : 253.0) + jitter(3.0)
            let vo = (inDriftWeek ? 8.9 : 8.6) + jitter(0.15)
            let speed = 3.35 + jitter(0.05)
            runs.append(GaitRun(
                id: UUID(uuidString: String(format: "00000000-0000-4000-8000-%012d", daysAgo))!,
                date: date,
                groundContactMs: gct, groundContactSDMs: 9.0 + jitter(1.0),
                verticalOscillationCm: vo, verticalOscillationSDCm: 0.5 + jitter(0.05),
                speedMetersPerSecond: speed, sampleCount: 420 + Int(jitter(40))
            ))
        }
        return runs
    }

    /// Same structure with no drift, for the "steady" state in previews.
    public static func sixWeeksSteady(asOf now: Date = .now, calendar: Calendar = .current) -> [GaitRun] {
        sixWeeksWithDrift(asOf: now, calendar: calendar).map { r in
            GaitRun(
                id: r.id, date: r.date,
                groundContactMs: r.groundContactMs.map { $0 > 262 ? $0 - 15 : $0 },
                groundContactSDMs: r.groundContactSDMs,
                verticalOscillationCm: r.verticalOscillationCm.map { $0 > 8.75 ? $0 - 0.3 : $0 },
                verticalOscillationSDCm: r.verticalOscillationSDCm,
                speedMetersPerSecond: r.speedMetersPerSecond, sampleCount: r.sampleCount
            )
        }
    }
}
