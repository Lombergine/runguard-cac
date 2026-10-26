//
//  QualityTests.swift — pre-flight checks. Port of acwr/tests/test_quality.py;
//  each test drives one real failure mode found in a three-year Strava log.
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import XCTest
@testable import RunGuardCore

final class QualityTests: XCTestCase {
    let ref = Reference.shared
    let jan1_2026 = isoDate("2026-01-01")

    private func checks(_ q: LoadQuality) -> Set<QualityCheck> { Set(q.findings.map(\.check)) }
    private func rep(_ v: Double, _ n: Int) -> [Double] { [Double](repeating: v, count: n) }

    func testAnOrdinaryLogPassesWithNothingToReport() {
        let q = Quality.checkLoad(ref.gamma400.load)
        XCTAssert(q.ok)
        XCTAssertEqual(q.findings, [])
        XCTAssertEqual(q.nDays, 400)
        XCTAssertEqual(q.nTrainingDays, 400)
    }

    func testTheReportCountsDaysAndTrainingDaysSeparately() {
        let q = Quality.checkLoad(Array(repeating: [10.0, 0, 10, 0], count: 10).flatMap { $0 })
        XCTAssertEqual(q.nDays, 40)
        XCTAssertEqual(q.nTrainingDays, 20)
    }

    func testAHistoryShorterThanTheChronicWindowIsAnError() {
        let q = Quality.checkLoad(rep(10, 20))
        XCTAssertFalse(q.ok)
        XCTAssert(checks(q).contains(.history))
        XCTAssertEqual(q.errors[0].message, ref.hand.short20_error)
    }

    func testTheChronicWindowTheUserIntendsIsWhatGetsChecked() {
        XCTAssert(Quality.checkLoad(rep(10, 30), chronic: 28).ok)
        XCTAssertFalse(Quality.checkLoad(rep(10, 30), chronic: 42).ok)
    }

    func testALogWithNoTrainingAtAllIsAnError() {
        let q = Quality.checkLoad(rep(0, 60))
        XCTAssertFalse(q.ok)
        XCTAssert(checks(q).contains(.noTraining))
    }

    func testANegativeLoadIsAnErrorAndTheDaysAreNamed() {
        var v = rep(10, 60); v[30] = -5
        let q = Quality.checkLoad(v)
        XCTAssertFalse(q.ok)
        let f = q.findings.first { $0.check == .negativeLoad }!
        XCTAssertEqual(f.dayIndices, [30])
        XCTAssertEqual(isoString(utc.date(byAdding: .day, value: 30, to: jan1_2026)!), "2026-01-31")
    }

    func testAChangeOfRecordingUnitIsCaught() {
        let q = Quality.checkLoad(rep(10, 100) + rep(10000, 100))
        let f = q.findings.first { $0.check == .suspectedUnitChange }
        XCTAssertNotNil(f)
        XCTAssert(f!.message.contains("factor of 1000"))
    }

    func testAPlausibleChangeInFitnessIsNotMistakenForAUnitChange() {
        XCTAssertFalse(checks(Quality.checkLoad(rep(20, 100) + rep(40, 100))).contains(.suspectedUnitChange))
    }

    func testASingleImplausibleDayIsReportedAsAnOutlier() {
        // A watch left running: 900 against a typical 10, on 2026-02-20.
        var v = rep(10, 100); v[50] = 900
        let q = Quality.checkLoad(v)
        let f = q.findings.first { $0.check == .outlierDays }!
        XCTAssertEqual(f.dayIndices, [50])
        let date = isoString(utc.date(byAdding: .day, value: 50, to: jan1_2026)!)
        XCTAssertEqual([date], ref.hand.outlier_dates)
        XCTAssertEqual(f.message, ref.hand.outlier_message)
    }

    func testALongRunIsNotAnOutlier() {
        XCTAssertFalse(checks(Quality.checkLoad(ref.gamma400.load)).contains(.outlierDays))
    }

    func testTheOutlierThresholdIsAdjustable() {
        var v = rep(10, 100); v[50] = 25
        XCTAssertFalse(checks(Quality.checkLoad(v)).contains(.outlierDays))
        XCTAssert(checks(Quality.checkLoad(v, outlierFactor: 2.0)).contains(.outlierDays))
    }

    func testALongBreakIsReportedWithTheDayItEnds() {
        let q = Quality.checkLoad(rep(10, 60) + rep(0, 30) + rep(10, 60))
        let f = q.findings.first { $0.check == .break }!
        XCTAssert(f.message.contains("30 days"))
        XCTAssertEqual(f.dayIndices, [89])
        XCTAssertEqual(isoString(utc.date(byAdding: .day, value: 89, to: jan1_2026)!), "2026-03-31")
        XCTAssert(ref.hand.break_message.contains("ending 2026-03-31"))
    }

    func testOrdinaryRestDaysAreNotABreak() {
        let week: [Double] = [10, 0, 10, 0, 10, 0, 10]
        XCTAssertFalse(checks(Quality.checkLoad(Array(repeating: week, count: 20).flatMap { $0 })).contains(.break))
    }

    func testUnobservedDaysAreDistinguishedFromRestDays() {
        XCTAssert(checks(Quality.checkLoad(rep(10, 30) + [.nan] + rep(10, 30))).contains(.unobservedDays))
        XCTAssertFalse(checks(Quality.checkLoad(rep(10, 30) + [0] + rep(10, 30))).contains(.unobservedDays))
    }

    func testAnExtremeDynamicRangeIsFlagged() {
        XCTAssert(checks(Quality.checkLoad(rep(1e-9, 50) + rep(1e6, 150))).contains(.extremeDynamicRange))
    }

    func testAMostlyRestLogIsNotedWithoutBeingAnError() {
        let q = Quality.checkLoad(Array(repeating: [10.0, 0, 0, 0, 0], count: 20).flatMap { $0 })
        XCTAssert(q.ok)
        XCTAssert(checks(q).contains(.mostlyRest))
    }

    func testALogWithBarelyMoreThanTheWarmUpIsNoted() {
        let q = Quality.checkLoad(rep(10, 40))
        XCTAssert(q.ok)
        XCTAssert(checks(q).contains(.fewUsableDays))
    }

    func testAPerfectlyConstantLogIsNoted() {
        XCTAssert(checks(Quality.checkLoad(rep(10, 60))).contains(.constantLoad))
    }

    func testErrorsAndWarningsAreSeparableAndOkTracksOnlyErrors() {
        let q = Quality.checkLoad(rep(10, 10) + rep(0, 30) + rep(10, 10), chronic: 28)
        XCTAssert(q.findings.contains { $0.severity == .warning })
        XCTAssertEqual(q.ok, q.errors.isEmpty)
    }

    func testLumpyLogMatchesPythonFindings() {
        // Three years of lumpy training with an injury layoff and a holiday:
        // the only finding should be the 40-day break, ending where Python says.
        let s = ref.lumpy900
        let d = s.diagnostics_rac!.quality
        let q = Quality.checkLoad(s.load)
        XCTAssertEqual(q.nDays, d.n_days)
        XCTAssertEqual(q.nTrainingDays, d.n_training_days)
        XCTAssertEqual(q.ok, d.ok)
        XCTAssertEqual(q.findings.map(\.check.rawValue), d.findings.map(\.check))
        XCTAssertEqual(q.findings.map(\.severity.rawValue), d.findings.map(\.severity))
        let start = isoDate(s.start)
        for (ours, theirs) in zip(q.findings, d.findings) {
            let dates = ours.dayIndices.map { isoString(utc.date(byAdding: .day, value: $0, to: start)!) }
            XCTAssertEqual(dates, theirs.dates)
        }
    }

    func testRhythmLogIsCleanLikePython() {
        XCTAssertEqual(Quality.checkLoad(ref.rhythm500.load).findings.count, ref.rhythm500.diagnostics_rac!.quality.findings.count)
    }
}
