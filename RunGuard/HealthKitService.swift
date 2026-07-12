//
//  HealthKitService.swift
//  RunGuard
//

import HealthKit

/// Sole owner of HealthKit access. Views and view models never touch
/// HKHealthStore directly.
final class HealthKitService {
    /// One store per app is Apple's recommended pattern; it is cheap to hold
    /// and all queries/authorization go through it.
    private let store = HKHealthStore()

    /// Everything RunGuard reads. Read-only by design — we never pass any
    /// types to `toShare`, so the app cannot write to Health.
    private static let readTypes: Set<HKObjectType> = [
        // Workout sessions (we filter to running when querying).
        .workoutType(),
        // Distance samples backing a run's total distance.
        HKQuantityType(.distanceWalkingRunning),
        // Heart-rate samples, needed later for per-run average HR.
        HKQuantityType(.heartRate),
    ]

    /// False on devices without Health data (e.g. some iPads); calling any
    /// other HealthKit API there throws, so callers must check this first.
    var isAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    /// Whether the authorization sheet still needs to be presented.
    /// `.shouldRequest` = user hasn't been asked for at least one of our
    /// types; `.unnecessary` = the sheet was already shown (it does NOT mean
    /// access was granted — HealthKit hides read grant/deny from apps).
    func authorizationRequestStatus() async throws -> HKAuthorizationRequestStatus {
        try await store.statusForAuthorizationRequest(toShare: [], read: Self.readTypes)
    }

    /// Presents the Health permission sheet. Resolves successfully whether
    /// the user allows or denies — a denied read is indistinguishable from
    /// empty data, so no grant/deny result is returned. Throws only on
    /// mechanical failure (missing usage description, unavailable store).
    func requestAuthorization() async throws {
        try await store.requestAuthorization(toShare: [], read: Self.readTypes)
    }
}
