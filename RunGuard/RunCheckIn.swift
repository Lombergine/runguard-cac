//
//  RunCheckIn.swift
//  RunGuard
//

import Foundation
import SwiftData

/// Where it hurts. String raw values because that's what SwiftData persists
/// (see the storage properties below); order here is the picker's display
/// order and the tie-break order in SorenessService.
nonisolated enum BodyArea: String, CaseIterable, Identifiable, Codable {
    case shin, knee, hip, foot, ankle, other

    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

/// The athlete's subjective log for one run: perceived effort plus any pain.
///
/// Linking to HealthKit: an HKWorkout lives in Apple's Health database, not
/// ours, so it can't be a SwiftData relationship. Instead we store the
/// workout's UUID (stable across fetches — HealthKit guarantees it) as a
/// foreign key, plus a snapshot of the run's date and distance. The snapshot
/// means load and pain stay together in our store even if the workout later
/// vanishes from HealthKit (user revokes access, deletes data, or it ages
/// past the 90-day fetch window).
@Model
final class RunCheckIn {
    /// HKWorkout.uuid of the run this check-in belongs to. Unique: one
    /// check-in per run — inserting a second becomes an upsert.
    @Attribute(.unique) var workoutID: UUID
    /// Snapshot of the run's start date.
    var workoutDate: Date
    /// Snapshot of the run's distance in miles (nil if HealthKit had none).
    var workoutDistanceMiles: Double?

    /// When the athlete logged (or last edited) this check-in.
    var loggedAt: Date
    /// Rating of perceived exertion, 1–10.
    var rpe: Int

    /// v1 storage: a single area. Kept, and kept in sync, so that a store
    /// written by an older build still reads correctly and a downgrade does
    /// not lose the primary complaint. New code should not read it directly.
    private var painAreaRaw: String?

    /// v2 storage: comma-separated raw values, because an athlete with shin
    /// AND knee pain used to have to pick one — which meant the discarded
    /// area never accumulated toward a recurring complaint. Added as a new
    /// optional property so SwiftData migrates the existing store
    /// automatically (lightweight migration), with no schema version bump.
    ///
    /// A joined string rather than `[String]`: predicates can't see into
    /// arrays of raw values any better than they can into enums, and every
    /// consumer loads the objects anyway.
    private var painAreasRaw: String?

    /// Worst severity across the reported areas, 1–10; nil when no pain.
    /// One number for the whole complaint rather than one per area — asking
    /// for a separate rating per body part is exactly the friction that gets
    /// a post-run log skipped.
    var painSeverity: Int?

    /// Every area reported for this run, in `BodyArea.allCases` order.
    var painAreas: [BodyArea] {
        get {
            if let painAreasRaw, !painAreasRaw.isEmpty {
                let stored = Set(painAreasRaw.split(separator: ",").map(String.init))
                return BodyArea.allCases.filter { stored.contains($0.rawValue) }
            }
            // Fall back to the v1 field for records written before v2.
            return painAreaRaw.flatMap(BodyArea.init(rawValue:)).map { [$0] } ?? []
        }
        set {
            // Filtering allCases both de-duplicates and imposes a stable
            // order, so two logs with the same areas store identically.
            let unique = BodyArea.allCases.filter(newValue.contains)
            painAreasRaw = unique.isEmpty ? nil : unique.map(\.rawValue).joined(separator: ",")
            painAreaRaw = unique.first?.rawValue
        }
    }

    /// The primary complaint, for anything that wants a single area.
    var painArea: BodyArea? { painAreas.first }

    var hasPain: Bool { !painAreas.isEmpty }

    init(
        workoutID: UUID,
        workoutDate: Date,
        workoutDistanceMiles: Double?,
        rpe: Int,
        painAreas: [BodyArea],
        painSeverity: Int?,
        loggedAt: Date = .now
    ) {
        self.workoutID = workoutID
        self.workoutDate = workoutDate
        self.workoutDistanceMiles = workoutDistanceMiles
        self.rpe = rpe
        self.loggedAt = loggedAt

        let unique = BodyArea.allCases.filter(painAreas.contains)
        self.painAreasRaw = unique.isEmpty ? nil : unique.map(\.rawValue).joined(separator: ",")
        self.painAreaRaw = unique.first?.rawValue
        // No areas means no severity: a stored severity with nothing to
        // attach it to would count as a phantom report in SorenessService.
        self.painSeverity = unique.isEmpty ? nil : painSeverity
    }
}
