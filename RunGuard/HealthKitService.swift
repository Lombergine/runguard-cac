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

    // MARK: - Workout query

    /// The single knob for how far back RunGuard looks for runs.
    static let fetchWindowDays = 90

    /// Beats-per-minute: HealthKit stores heart rate as count/time, so the
    /// unit is built by dividing.
    private static let bpm = HKUnit.count().unitDivided(by: .minute())

    /// Fetches running workouts from the last `fetchWindowDays` days,
    /// newest first. Returns an empty array both when there are no runs and
    /// when read access was denied — HealthKit makes those indistinguishable.
    func fetchRunningWorkouts() async throws -> [RunningWorkout] {
        let windowStart = Calendar.current.date(
            byAdding: .day, value: -Self.fetchWindowDays, to: .now
        )!

        // Both subpredicates must hold: the workout's activity type is
        // running, AND it started inside the window. `strictStartDate`
        // keys the window off the start (not any overlap), so a run is
        // either in or out — no edge cases at the boundary.
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
            HKQuery.predicateForWorkouts(with: .running),
            HKQuery.predicateForSamples(
                withStart: windowStart, end: nil, options: .strictStartDate
            ),
        ])

        // HKSampleQuery is HealthKit's one-shot fetch: it runs the results
        // handler exactly once on a background queue. The continuation
        // bridges that callback into async/await.
        let workouts: [HKWorkout] = try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: .workoutType(),
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                // Sorting in the query (not after) lets HealthKit use its
                // indexes; descending start date = newest first.
                sortDescriptors: [
                    NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
                ]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    // The API hands back [HKSample]; workoutType() queries
                    // only ever contain HKWorkout, so the cast is safe.
                    continuation.resume(returning: samples as? [HKWorkout] ?? [])
                }
            }
            store.execute(query)
        }

        var runs: [RunningWorkout] = []
        for workout in workouts {
            runs.append(RunningWorkout(
                id: workout.uuid,
                date: workout.startDate,
                // statistics(for:) reads totals embedded in the workout —
                // no extra query. sumQuantity() is nil if the source never
                // recorded distance.
                distanceMiles: workout.statistics(
                    for: HKQuantityType(.distanceWalkingRunning)
                )?.sumQuantity()?.doubleValue(for: .mile()),
                duration: workout.duration,
                averageHeartRate: await averageHeartRate(for: workout)
            ))
        }
        return runs
    }

    /// Average heart rate for one workout, nil if none was recorded.
    /// Heart rate is best-effort garnish: failures here return nil rather
    /// than sinking the whole list.
    private func averageHeartRate(for workout: HKWorkout) async -> Int? {
        // Fast path: Apple Watch workouts embed their heart-rate statistics
        // directly on the workout.
        if let embedded = workout.statistics(for: HKQuantityType(.heartRate))?.averageQuantity() {
            return Int(embedded.doubleValue(for: Self.bpm).rounded())
        }

        // Fallback for Garmin/Strava-synced workouts: those apps usually
        // write heart-rate samples separately rather than attaching them to
        // the workout, so we ask HealthKit to average every heart-rate
        // sample recorded during the workout's time span. HKStatisticsQuery
        // does the math inside the Health database instead of handing us
        // thousands of raw samples.
        let duringWorkout = HKQuery.predicateForSamples(
            withStart: workout.startDate, end: workout.endDate
        )
        let average: Double? = await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: HKQuantityType(.heartRate),
                quantitySamplePredicate: duringWorkout,
                options: .discreteAverage
            ) { _, statistics, _ in
                // HKStatisticsQuery reports "no matching samples" as an
                // error; for us that's simply "no heart rate", not a failure.
                continuation.resume(
                    returning: statistics?.averageQuantity()?.doubleValue(for: Self.bpm)
                )
            }
            store.execute(query)
        }
        return average.map { Int($0.rounded()) }
    }
}
