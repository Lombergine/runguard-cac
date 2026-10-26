//
//  GaitHealthKit.swift
//  RunGuard
//
//  Reads Apple Watch running dynamics out of HealthKit, one workout at a
//  time, and flattens them into RunGuardCore's `GaitRun` so the gait model
//  never has to import HealthKit. Ground contact time and vertical
//  oscillation are stored as quantity samples written every few seconds of
//  an outdoor run (watchOS 9+); the per-run mean and standard deviation are
//  computed here from those samples.
//
//  A workout with no dynamics samples (Garmin, Strava, older watches) comes
//  back with nil metrics, which the model reports as "no dynamics" rather
//  than guessing.
//
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import HealthKit
import RunGuardCore

extension HealthKitService {
    /// Only the runs the gait model can use: the recent week plus the four
    /// baseline weeks before it.
    static let gaitWindowDays = Gait.recentWindowDays + Gait.baselineWindowDays

    /// Per-run running dynamics for the given runs. Read-only; failures on a
    /// single run leave that run without dynamics rather than failing all.
    func fetchGaitRuns(for runs: [RunningWorkout]) async -> [GaitRun] {
        var out: [GaitRun] = []
        for run in runs {
            // The workout's own time span. Samples are matched by time, not
            // by workout association, because third-party apps write them
            // separately (same approach as the heart-rate fallback).
            let during = HKQuery.predicateForSamples(
                withStart: run.date, end: run.date.addingTimeInterval(run.duration)
            )
            let gct = await summary(
                of: HKQuantityType(.runningGroundContactTime),
                unit: .secondUnit(with: .milli), predicate: during
            )
            let vo = await summary(
                of: HKQuantityType(.runningVerticalOscillation),
                unit: .meterUnit(with: .centi), predicate: during
            )
            // Mean speed from the workout totals. Available for Garmin runs
            // too, which is what lets the pace guard work without dynamics.
            let speed: Double? = run.distanceMiles.flatMap { miles in
                run.duration > 0 ? miles * 1609.344 / run.duration : nil
            }
            out.append(GaitRun(
                id: run.id, date: run.date,
                groundContactMs: gct?.mean, groundContactSDMs: gct?.sd,
                verticalOscillationCm: vo?.mean, verticalOscillationSDCm: vo?.sd,
                speedMetersPerSecond: speed,
                sampleCount: (gct?.count ?? 0) + (vo?.count ?? 0)
            ))
        }
        return out
    }

    /// Mean, sample standard deviation and count of one quantity type's
    /// samples inside a predicate. HKSampleQuery hands back the raw samples;
    /// HKStatisticsQuery cannot produce a standard deviation, so the math
    /// is done here.
    private func summary(
        of type: HKQuantityType, unit: HKUnit, predicate: NSPredicate
    ) async -> (mean: Double, sd: Double?, count: Int)? {
        let values: [Double] = await withCheckedContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type, predicate: predicate,
                limit: HKObjectQueryNoLimit, sortDescriptors: nil
            ) { _, samples, _ in
                // An error (including "type not authorized") reads as no
                // samples: HealthKit hides read denial by design.
                let v = (samples as? [HKQuantitySample] ?? []).map { $0.quantity.doubleValue(for: unit) }
                continuation.resume(returning: v)
            }
            store.execute(query)
        }
        guard !values.isEmpty else { return nil }
        return (
            Statistics.mean(values),
            values.count > 1 ? Statistics.standardDeviation(values) : nil,
            values.count
        )
    }
}
