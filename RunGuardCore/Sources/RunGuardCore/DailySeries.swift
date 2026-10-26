//
//  DailySeries.swift
//  RunGuardCore
//
//  Turns a list of activities into one load value per calendar day, with no
//  gaps. Rest days are explicit zeros, not missing entries. A rolling 28-day
//  window computed over only the days someone trained is not a 28-day
//  window, and that is the most common way a published ACWR goes wrong.
//  Port of `acwr.daily_load`.
//
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import Foundation

/// One training activity: when it happened and how much load it carried.
/// Any non-negative load unit works (miles, minutes, sRPE, TSS) as long as
/// it is consistent — the ratio is scale free.
public struct Activity: Sendable, Equatable {
    public let date: Date
    public let load: Double

    public init(date: Date, load: Double) {
        self.date = date
        self.load = load
    }
}

public enum DailySeriesError: Error, Equatable {
    case noActivities
    case negativeLoad
    case endBeforeStart
}

/// A continuous day-indexed load series. `values[i]` is the load on the day
/// `i` days after `start`.
public struct DailySeries: Sendable, Equatable {
    /// Start of the first day, in the calendar used to build the series.
    public let start: Date
    public let values: [Double]

    public init(start: Date, values: [Double]) {
        self.start = start
        self.values = values
    }

    public var count: Int { values.count }

    /// Sum activities per calendar day and fill every day from the first
    /// activity through `end` (or the last activity) with an explicit zero
    /// where nothing was recorded.
    public static func build(
        activities: [Activity],
        calendar: Calendar = .current,
        through end: Date? = nil
    ) throws -> DailySeries {
        guard !activities.isEmpty else { throw DailySeriesError.noActivities }
        guard activities.allSatisfy({ $0.load >= 0 }) else { throw DailySeriesError.negativeLoad }

        var byDay: [Date: Double] = [:]
        for a in activities {
            byDay[calendar.startOfDay(for: a.date), default: 0] += a.load
        }
        let first = byDay.keys.min()!
        let last = end.map(calendar.startOfDay(for:)) ?? byDay.keys.max()!
        guard first <= last else { throw DailySeriesError.endBeforeStart }

        var values: [Double] = []
        var day = first
        while day <= last {
            values.append(byDay[day] ?? 0)
            day = calendar.date(byAdding: .day, value: 1, to: day)!
        }
        return DailySeries(start: first, values: values)
    }

    /// The calendar day at index `i`.
    public func date(at i: Int, calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .day, value: i, to: start)!
    }
}
