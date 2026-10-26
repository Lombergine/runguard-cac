//
//  ACWRService.swift
//  RunGuard
//

import Foundation

/// Training-load zones from the acute:chronic workload ratio (ACWR)
/// literature (Gabbett et al.). The ratio compares what you did recently
/// (acute) against what your body is adapted to (chronic).
// The model types and the math are `nonisolated`: they're pure values with
// no HealthKit or UI ties, and the project's default-MainActor isolation
// would otherwise pin them (and everything that calls them) to the main
// thread.
nonisolated enum TrainingZone: Equatable {
    /// Below `undertrainingBelow` (0.8 by default) — training well below
    /// your adaptation baseline.
    case undertraining
    /// The "sweet spot": enough stimulus, low spike risk.
    case optimal
    /// Load is climbing faster than the base supports.
    case caution
    /// Acute spike; injury risk rises sharply in the literature.
    case highRisk

    /// The cut points are a parameter, not a constant, because coaches run
    /// different programs and asked to move them. `.standard` reproduces the
    /// published Gabbett values, so existing callers and tests are unchanged.
    /// Written as if/else rather than a `switch` because range patterns need
    /// compile-time bounds.
    init(ratio: Double, thresholds: ACWRThresholds = .standard) {
        if ratio < thresholds.undertrainingBelow {
            self = .undertraining
        } else if ratio < thresholds.optimalBelow {
            self = .optimal
        } else if ratio <= thresholds.cautionThrough {
            self = .caution
        } else {
            self = .highRisk
        }
    }
}

/// One day in the ACWR series. The series exists for validation: every
/// intermediate quantity is exposed so the math can be checked by hand
/// against the run list.
nonisolated struct ACWRPoint: Identifiable, Equatable {
    var id: Date { date }
    /// The calendar day this point describes.
    let date: Date
    /// Miles run that day (0 on rest days — a real zero, not missing data).
    let dailyLoad: Double
    /// Mean daily miles over the trailing 7 days (including this one).
    let acuteLoad: Double
    /// Mean daily miles over the trailing 28 days (including this one).
    let chronicLoad: Double
    /// acuteLoad / chronicLoad. Nil when chronic is 0 (no running in the
    /// trailing 28 days) — the ratio is undefined, not infinite.
    let ratio: Double?
    let zone: TrainingZone?
    /// True while fewer than 21 days of history back this point; the
    /// chronic average is built on too little data to trust. Kept in the
    /// series (unlike today's headline) so cold-start behavior is inspectable.
    let lowConfidence: Bool
}

/// Today's headline answer. An enum, not a struct with nullable fields,
/// so UI code is forced to handle the cold-start and no-data cases
/// explicitly rather than accidentally rendering a garbage ratio.
nonisolated enum ACWRStatus: Equatable {
    /// Fewer than 21 days between the first known run and today. Any ratio
    /// would be built on an unreliable chronic baseline, so none is given.
    case lowConfidence(daysOfHistory: Int)
    /// 21+ days of history but zero miles in the chronic window — there is
    /// no baseline to compare against.
    case noRecentTraining
    /// Normal case: a trustworthy ratio and its zone.
    case score(ratio: Double, zone: TrainingZone, acuteLoad: Double, chronicLoad: Double)
}

nonisolated struct ACWRAssessment: Equatable {
    /// Today's status, for the eventual risk UI.
    let status: ACWRStatus
    /// One point per day from the first known run through today,
    /// oldest first. For validation/charting.
    let series: [ACWRPoint]
}

/// Computes acute:chronic workload ratio on top of HealthKitService.
/// All math lives in a pure static function over plain values, so it can be
/// unit-tested without HealthKit.
final class ACWRService {
    nonisolated static let acuteWindowDays = 7
    nonisolated static let chronicWindowDays = 28
    /// Below this much history the chronic average is mostly noise
    /// (industry-common cutoff of ~3 weeks).
    nonisolated static let minimumHistoryDays = 21

    private let healthKit: HealthKitService

    init(healthKit: HealthKitService? = nil) {
        // Constructed inside the init (not as a default argument) because
        // default arguments evaluate outside MainActor isolation.
        self.healthKit = healthKit ?? HealthKitService()
    }

    /// Fetches runs (window = HealthKitService.fetchWindowDays, 90 days —
    /// comfortably more than the 28-day chronic window) and computes the
    /// assessment.
    func assessment(thresholds: ACWRThresholds = .standard) async throws -> ACWRAssessment {
        let runs = try await healthKit.fetchRunningWorkouts()
        return Self.compute(runs: runs, thresholds: thresholds)
    }

    /// Pure ACWR math over already-fetched runs.
    nonisolated static func compute(
        runs: [RunningWorkout],
        asOf now: Date = .now,
        calendar: Calendar = .current,
        thresholds: ACWRThresholds = .standard
    ) -> ACWRAssessment {
        let today = calendar.startOfDay(for: now)

        // Step 1 — daily training load: total miles per calendar day.
        // Distance is our load proxy (intensity-blind; see CLAUDE.md).
        // A workout with no distance data contributes 0.
        var milesByDay: [Date: Double] = [:]
        for run in runs {
            let day = calendar.startOfDay(for: run.date)
            milesByDay[day, default: 0] += run.distanceMiles ?? 0
        }

        guard let firstDay = milesByDay.keys.min(), firstDay <= today else {
            return ACWRAssessment(status: .lowConfidence(daysOfHistory: 0), series: [])
        }

        // Step 2 — a gapless day-by-day load array from the first run
        // through today. Rest days MUST appear as explicit zeros: a week
        // off genuinely lowers acute load, so skipping empty days would
        // silently corrupt both averages.
        var dailyLoads: [Double] = []
        var dates: [Date] = []
        var day = firstDay
        while day <= today {
            dates.append(day)
            dailyLoads.append(milesByDay[day] ?? 0)
            day = calendar.date(byAdding: .day, value: 1, to: day)!
        }

        // Step 3 — rolling means. Acute and chronic are both expressed as
        // *mean daily miles*, so the ratio is dimensionless and directly
        // comparable (a 7-day sum against a 28-day sum would bake in a 4x
        // skew). Windows are truncated at the start of history: with only
        // 10 days of data, the "28-day" chronic mean averages those 10 —
        // which is exactly why early points carry lowConfidence.
        let series: [ACWRPoint] = dailyLoads.indices.map { i in
            let acuteSlice = dailyLoads[max(0, i - (Self.acuteWindowDays - 1))...i]
            let chronicSlice = dailyLoads[max(0, i - (Self.chronicWindowDays - 1))...i]
            let acute = acuteSlice.reduce(0, +) / Double(acuteSlice.count)
            let chronic = chronicSlice.reduce(0, +) / Double(chronicSlice.count)
            let ratio: Double? = chronic > 0 ? acute / chronic : nil
            return ACWRPoint(
                date: dates[i],
                dailyLoad: dailyLoads[i],
                acuteLoad: acute,
                chronicLoad: chronic,
                ratio: ratio,
                zone: ratio.map { TrainingZone(ratio: $0, thresholds: thresholds) },
                lowConfidence: (i + 1) < Self.minimumHistoryDays
            )
        }

        // Step 4 — today's headline from the last point.
        let todayPoint = series[series.count - 1]
        let status: ACWRStatus
        if todayPoint.lowConfidence {
            status = .lowConfidence(daysOfHistory: series.count)
        } else if let ratio = todayPoint.ratio, let zone = todayPoint.zone {
            status = .score(
                ratio: ratio,
                zone: zone,
                acuteLoad: todayPoint.acuteLoad,
                chronicLoad: todayPoint.chronicLoad
            )
        } else {
            status = .noRecentTraining
        }

        return ACWRAssessment(status: status, series: series)
    }
}
