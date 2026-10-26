//
//  DailySeriesTests.swift — building the continuous daily load series.
//  Port of acwr/tests/test_load.py.
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import XCTest
@testable import RunGuardCore

final class DailySeriesTests: XCTestCase {
    func testActivitiesOnTheSameDayAreSummed() throws {
        let d = isoDate("2026-01-01")
        let s = try DailySeries.build(activities: [.init(date: d, load: 10), .init(date: d, load: 20), .init(date: d, load: 5)], calendar: utc)
        XCTAssertEqual(s.values, [35])
    }

    func testDaysWithoutActivityAreFilledWithZero() throws {
        let s = try DailySeries.build(activities: [.init(date: isoDate("2026-01-01"), load: 40), .init(date: isoDate("2026-01-05"), load: 60)], calendar: utc)
        XCTAssertEqual(s.values, [40, 0, 0, 0, 60])
        XCTAssertEqual(isoString(s.date(at: 4, calendar: utc)), "2026-01-05")
    }

    func testTimestampsAreTruncatedToCalendarDays() throws {
        let morning = isoDate("2026-01-01").addingTimeInterval(6.5 * 3600)
        let evening = isoDate("2026-01-01").addingTimeInterval(18.75 * 3600)
        let s = try DailySeries.build(activities: [.init(date: morning, load: 25), .init(date: evening, load: 25)], calendar: utc)
        XCTAssertEqual(s.values, [50])
    }

    func testAnExplicitEndExtendsTheSeriesWithRestDays() throws {
        let s = try DailySeries.build(activities: [.init(date: isoDate("2026-01-10"), load: 10)], calendar: utc, through: isoDate("2026-01-20"))
        XCTAssertEqual(s.count, 11)
        XCTAssertEqual(s.values.last, 0)
    }

    func testNegativeLoadAndEmptyInputAreRejected() {
        XCTAssertThrowsError(try DailySeries.build(activities: [.init(date: isoDate("2026-01-01"), load: -5)], calendar: utc))
        XCTAssertThrowsError(try DailySeries.build(activities: [], calendar: utc))
    }
}
