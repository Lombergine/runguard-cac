//
//  RunningWorkout.swift
//  RunGuard
//

import Foundation

/// One run, flattened from HealthKit's types into plain values so the view
/// layer never has to import HealthKit.
struct RunningWorkout: Identifiable, Equatable {
    /// HKWorkout's own UUID, stable across fetches.
    let id: UUID
    /// When the run started.
    let date: Date
    /// Total distance in miles. Optional: a workout can exist with no
    /// distance samples (e.g. treadmill run from an app that didn't record it).
    let distanceMiles: Double?
    /// Elapsed time in seconds.
    let duration: TimeInterval
    /// Average heart rate in beats per minute. Optional: not every source
    /// records heart rate.
    let averageHeartRate: Int?
}
