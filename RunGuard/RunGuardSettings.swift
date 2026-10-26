//
//  RunGuardSettings.swift
//  RunGuard
//

import Foundation
import Observation

// MARK: - ACWR thresholds

/// The cut points between training zones. These were hardcoded (0.8 / 1.3 /
/// 1.5) from Gabbett's original work, but coaches asked to move them: a
/// distance program running 70-mile weeks tolerates a different spike than a
/// freshman doing 15, and some coaches want to be warned earlier than 1.3.
///
/// Pure value type so the ACWR math stays testable without any store.
nonisolated struct ACWRThresholds: Equatable, Codable, Sendable {
    /// Below this ratio the athlete is undertraining.
    var undertrainingBelow: Double
    /// Below this ratio (and at or above `undertrainingBelow`) is optimal.
    var optimalBelow: Double
    /// Up to and including this ratio is caution. Above it is high risk.
    var cautionThrough: Double

    /// The published defaults. Anything a coach changes is a deviation from
    /// these, and the settings screen says so.
    static let standard = ACWRThresholds(
        undertrainingBelow: 0.8,
        optimalBelow: 1.3,
        cautionThrough: 1.5
    )

    /// Hard bounds on what a coach can dial in. Wide enough to be useful,
    /// narrow enough that the zones stay meaningful.
    static let allowedRange: ClosedRange<Double> = 0.5...2.5
    /// Zones must stay strictly ordered with at least this much air between
    /// them, otherwise a zone becomes unreachable.
    static let minimumSeparation = 0.05

    /// Clamps into range and forces strict ordering. The settings sliders
    /// already constrain each other, so this is the safety net for values
    /// read back from disk (a downgraded build, a hand-edited plist).
    func normalized() -> ACWRThresholds {
        let lo = ACWRThresholds.allowedRange.lowerBound
        let hi = ACWRThresholds.allowedRange.upperBound
        let gap = ACWRThresholds.minimumSeparation

        let under = min(max(undertrainingBelow, lo), hi - 2 * gap)
        let optimal = min(max(optimalBelow, under + gap), hi - gap)
        let caution = min(max(cautionThrough, optimal + gap), hi)
        return ACWRThresholds(
            undertrainingBelow: under,
            optimalBelow: optimal,
            cautionThrough: caution
        )
    }
}

// MARK: - Soreness rules

/// When a repeated pain report stops being noise and becomes a complaint
/// worth surfacing. Also coach-adjustable: a program that logs every twinge
/// wants a higher floor than one where athletes only report real problems.
nonisolated struct SorenessSettings: Equatable, Codable, Sendable {
    /// How far back to look for repeats.
    var windowDays: Int
    /// Reports of the same area inside the window needed to raise a flag.
    var minimumReports: Int
    /// Severity below this is ignored entirely — a 1/10 niggle mentioned
    /// three times is not a complaint.
    var severityFloor: Int
    /// Escalation shortcut: two reports flag immediately if the most recent
    /// severity is at least this. Something that jumped to an 8 should not
    /// wait for a third run.
    var escalationSeverity: Int

    static let standard = SorenessSettings(
        windowDays: 21,
        minimumReports: 3,
        severityFloor: 3,
        escalationSeverity: 7
    )

    static let windowRange = 7...42
    static let reportsRange = 2...6
    static let severityRange = 1...10

    func normalized() -> SorenessSettings {
        SorenessSettings(
            windowDays: min(max(windowDays, SorenessSettings.windowRange.lowerBound), SorenessSettings.windowRange.upperBound),
            minimumReports: min(max(minimumReports, SorenessSettings.reportsRange.lowerBound), SorenessSettings.reportsRange.upperBound),
            severityFloor: min(max(severityFloor, 1), 10),
            escalationSeverity: min(max(escalationSeverity, severityFloor), 10)
        )
    }
}

// MARK: - Store

/// Both adjustable rule sets, persisted in UserDefaults.
///
/// UserDefaults rather than SwiftData on purpose: these are a handful of
/// scalars with no history and no relationships, and keeping them out of the
/// model container means changing a threshold can never migrate or corrupt
/// an athlete's check-in data.
@MainActor
@Observable
final class RunGuardSettings {
    static let shared = RunGuardSettings()

    private static let thresholdsKey = "runguard.acwrThresholds.v1"
    private static let sorenessKey = "runguard.sorenessSettings.v1"

    private let defaults: UserDefaults

    var thresholds: ACWRThresholds {
        // The sliders already bound each other, so normalizing here is a
        // no-op in practice. The guard stops the assignment from recursing.
        didSet {
            let clean = thresholds.normalized()
            if clean != thresholds { thresholds = clean; return }
            persist(thresholds, key: Self.thresholdsKey)
        }
    }

    var soreness: SorenessSettings {
        // Raising the severity floor above the escalation level is reachable
        // from the steppers, so this one does real work.
        didSet {
            let clean = soreness.normalized()
            if clean != soreness { soreness = clean; return }
            persist(soreness, key: Self.sorenessKey)
        }
    }

    /// `UserDefaults?` rather than a default argument of `.standard`, because
    /// default arguments are evaluated outside this type's MainActor
    /// isolation (same reason HealthKitService is built inside its inits).
    init(defaults: UserDefaults? = nil) {
        let store = defaults ?? .standard
        self.defaults = store
        self.thresholds = Self.load(ACWRThresholds.self, key: Self.thresholdsKey, from: store)?.normalized() ?? .standard
        self.soreness = Self.load(SorenessSettings.self, key: Self.sorenessKey, from: store)?.normalized() ?? .standard
    }

    var usesCustomThresholds: Bool { thresholds != .standard }
    var usesCustomSoreness: Bool { soreness != .standard }

    func resetThresholds() { thresholds = .standard }
    func resetSoreness() { soreness = .standard }

    private func persist<T: Encodable>(_ value: T, key: String) {
        // A failed encode should never take the app down or wipe the stored
        // value; the in-memory setting still applies for this session.
        guard let data = try? JSONEncoder().encode(value) else { return }
        defaults.set(data, forKey: key)
    }

    private static func load<T: Decodable>(_ type: T.Type, key: String, from defaults: UserDefaults) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}
