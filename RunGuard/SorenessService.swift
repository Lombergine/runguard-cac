//
//  SorenessService.swift
//  RunGuard
//

import Foundation

/// Which way a complaint is heading. Direction matters more than the raw
/// number: a 6 that was a 3 last week is the one to act on, and a 6 that was
/// an 8 is already being managed.
nonisolated enum SorenessTrend: Equatable {
    case rising, steady, easing

    var label: String {
        switch self {
        case .rising: "getting worse"
        case .steady: "not improving"
        case .easing: "improving"
        }
    }
}

/// One area the athlete has reported more than once.
nonisolated struct SorenessFlag: Identifiable, Equatable {
    var id: BodyArea { area }
    let area: BodyArea
    /// Reports of this area inside the window that cleared the severity floor.
    let reports: Int
    /// Runs logged inside the window, for the "3 of your last 8 runs" phrasing.
    let runsLogged: Int
    let firstReported: Date
    let lastReported: Date
    let latestSeverity: Int
    let peakSeverity: Int
    let averageSeverity: Double
    let trend: SorenessTrend
    /// Reported on every single run logged since it first appeared. This is
    /// the pattern that most often turns into a stress fracture.
    let isConsecutive: Bool

    /// Ranking only — never shown as a number. Recency and direction are
    /// weighted above raw count so a fading old complaint sinks.
    var concernScore: Double {
        var score = Double(latestSeverity) * 2 + Double(reports)
        switch trend {
        case .rising: score += 4
        case .steady: score += 1
        case .easing: score -= 2
        }
        if isConsecutive { score += 3 }
        return score
    }
}

nonisolated struct SorenessReport: Equatable {
    /// Most concerning first.
    let flags: [SorenessFlag]
    let windowDays: Int
    /// Runs logged in the window. Zero means the athlete has not been
    /// checking in, which is its own signal — an empty report is not the
    /// same as "no pain".
    let runsLogged: Int

    var hasFlags: Bool { !flags.isEmpty }

    static let empty = SorenessReport(flags: [], windowDays: 0, runsLogged: 0)
}

/// Finds recurring complaints across check-ins.
///
/// Per-run pain was already captured; nothing ever looked at more than one
/// run at a time, so an athlete reporting the same shin on six straight runs
/// produced six isolated entries and no signal. This is the pass across them.
///
/// Pure static math over already-fetched values, like ACWRService, so it can
/// be unit-tested without SwiftData.
nonisolated enum SorenessService {

    static func report(
        checkIns: [RunCheckIn],
        asOf now: Date = .now,
        calendar: Calendar = .current,
        settings: SorenessSettings = .standard
    ) -> SorenessReport {
        let settings = settings.normalized()
        let today = calendar.startOfDay(for: now)
        guard let windowStart = calendar.date(
            byAdding: .day,
            value: -(settings.windowDays - 1),
            to: today
        ) else { return .empty }

        // Ordered oldest-first: the trend split below depends on it, and
        // @Query gives no ordering guarantee.
        let inWindow = checkIns
            .filter { calendar.startOfDay(for: $0.workoutDate) >= windowStart }
            .sorted { $0.workoutDate < $1.workoutDate }

        guard !inWindow.isEmpty else {
            return SorenessReport(flags: [], windowDays: settings.windowDays, runsLogged: 0)
        }

        var flags: [SorenessFlag] = []

        for area in BodyArea.allCases {
            // A check-in with pain but no severity recorded counts as 0 and
            // is filtered out by the floor rather than treated as severe.
            let hits = inWindow.filter { checkIn in
                checkIn.painAreas.contains(area)
                    && (checkIn.painSeverity ?? 0) >= settings.severityFloor
            }
            guard hits.count >= 2 else { continue }

            let severities = hits.map { $0.painSeverity ?? 0 }
            let latest = severities[severities.count - 1]

            let qualifies = hits.count >= settings.minimumReports
                || latest >= settings.escalationSeverity
            guard qualifies else { continue }

            guard let first = hits.first?.workoutDate,
                  let last = hits.last?.workoutDate else { continue }

            // Every run logged from the first report onward — the
            // denominator for "has it shown up every time since".
            let sinceFirst = inWindow.filter { $0.workoutDate >= first }
            let isConsecutive = sinceFirst.count == hits.count && hits.count >= 2

            flags.append(
                SorenessFlag(
                    area: area,
                    reports: hits.count,
                    runsLogged: inWindow.count,
                    firstReported: first,
                    lastReported: last,
                    latestSeverity: latest,
                    peakSeverity: severities.max() ?? latest,
                    averageSeverity: Double(severities.reduce(0, +)) / Double(severities.count),
                    trend: trend(of: severities),
                    isConsecutive: isConsecutive
                )
            )
        }

        // Stable order: concern first, then area order, so the list does not
        // shuffle between renders when two flags tie.
        // BodyArea.allCases order is the tie-break. Indexed inline rather
        // than via an extension: an extension declared in this module would
        // pick up the project's default MainActor isolation and could not be
        // called from this nonisolated function.
        let order = BodyArea.allCases
        let ordered = flags.sorted {
            if $0.concernScore != $1.concernScore { return $0.concernScore > $1.concernScore }
            let a = order.firstIndex(of: $0.area) ?? 0
            let b = order.firstIndex(of: $1.area) ?? 0
            return a < b
        }

        return SorenessReport(
            flags: ordered,
            windowDays: settings.windowDays,
            runsLogged: inWindow.count
        )
    }

    /// Compares the mean of the older half against the newer half. A whole
    /// point of severity is the smallest move worth calling a direction —
    /// anything less is inside the noise of a 1-10 self-report.
    private static func trend(of severities: [Int]) -> SorenessTrend {
        guard severities.count >= 2 else { return .steady }
        let split = severities.count / 2
        let older = severities.prefix(split)
        let newer = severities.suffix(severities.count - split)
        let olderMean = Double(older.reduce(0, +)) / Double(older.count)
        let newerMean = Double(newer.reduce(0, +)) / Double(newer.count)
        let delta = newerMean - olderMean
        if delta >= 1.0 { return .rising }
        if delta <= -1.0 { return .easing }
        return .steady
    }
}
