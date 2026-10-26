//
//  ACWRTests.swift — the three ratio methods, hand-computed values and the
//  Python reference. Port of acwr/tests/test_ratio.py.
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import XCTest
@testable import RunGuardCore

final class ACWRTests: XCTestCase {
    let ref = Reference.shared

    // MARK: the number everyone cites

    func testSteadyTrainingGivesARatioOfOne() throws {
        let r = try ACWR.series([Double](repeating: 50, count: 60)).ratio
        for v in r where !v.isNaN { XCTAssertEqual(v, 1.0, accuracy: 1e-12) }
    }

    func testCoupledRatioMatchesHandComputation() throws {
        // 28 days at 50, then 7 at 100: acute 100, chronic (21*50+7*100)/28 = 62.5
        let load = [Double](repeating: 50, count: 28) + [Double](repeating: 100, count: 7)
        XCTAssertEqual(try ACWR.series(load, method: .rac).ratio.last!, 100 / 62.5, accuracy: 1e-12)
        XCTAssertEqual(try ACWR.series(load, method: .rac).ratio.last!, ref.hand.spike_rac_last, accuracy: 1e-12)
    }

    func testUncoupledRatioMatchesHandComputation() throws {
        let load = [Double](repeating: 50, count: 28) + [Double](repeating: 100, count: 7)
        XCTAssertEqual(try ACWR.series(load, method: .rau).ratio.last!, 2.0, accuracy: 1e-12)
        XCTAssertEqual(try ACWR.series(load, method: .ewma).ratio.last!, ref.hand.spike_ewma_last, accuracy: 1e-9)
    }

    func testCoupledIsTheMoreConservativeOnASpike() throws {
        let load = [Double](repeating: 50, count: 28) + [Double](repeating: 100, count: 7)
        XCTAssertLessThan(try ACWR.series(load, method: .rac).ratio.last!, try ACWR.series(load, method: .rau).ratio.last!)
    }

    // MARK: window mechanics

    func testUncoupledChronicDoesNotSeeTheSpike() throws {
        let load = [Double](repeating: 10, count: 30) + [Double](repeating: 999, count: 7)
        XCTAssertEqual(try ACWR.chronicLoad(load, method: .rau).last!, 10, accuracy: 1e-12)
        XCTAssertGreaterThan(try ACWR.chronicLoad(load, method: .rac).last!, 10)
    }

    func testFullWindowsAreRequiredBeforeAValueAppears() throws {
        let load = [Double](repeating: 50, count: 40)
        for method in ACWRMethod.allCases {
            let r = try ACWR.series(load, method: method).ratio
            XCTAssertEqual(r.filter(\.isNaN).count, 27, "\(method) should warm up for 28 days")
            XCTAssertFalse(r[27].isNaN)
        }
    }

    func testEWMAHonoursAnExplicitMinPeriods() throws {
        let load = [Double](repeating: 50, count: 40)
        XCTAssertEqual(try ACWR.chronicLoad(load, method: .ewma, minPeriods: 1).filter(\.isNaN).count, 0)
        XCTAssertEqual(try ACWR.chronicLoad(load, method: .ewma, minPeriods: 10).filter(\.isNaN).count, 9)
    }

    // MARK: ewma

    func testEWMALambdaFollowsThePublishedFormula() throws {
        XCTAssertEqual(ACWR.alpha(span: 7), 0.25, accuracy: 1e-15)
        XCTAssertEqual(ACWR.alpha(span: 28), 2.0 / 29.0, accuracy: 1e-15)
        let load = [Double](repeating: 0, count: 10) + [100] + [Double](repeating: 0, count: 10)
        let a = try ACWR.acuteLoad(load, acute: 7, method: .ewma, minPeriods: 1)
        XCTAssertEqual(a[10], 25.0, accuracy: 1e-12)
        XCTAssertEqual(a[11], 18.75, accuracy: 1e-12)
        XCTAssertEqual(a[10], ref.hand.ewma_acute_spike_day, accuracy: 1e-12)
        XCTAssertEqual(a[11], ref.hand.ewma_acute_next_day, accuracy: 1e-12)
    }

    func testEWMAOnSteadyLoadConvergesToOne() throws {
        XCTAssertEqual(try ACWR.series([Double](repeating: 50, count: 400), method: .ewma).ratio.last!, 1.0, accuracy: 1e-9)
    }

    func testEWMAWeightsRecentDaysMoreHeavilyThanRollingDoes() throws {
        let load = [Double](repeating: 50, count: 50) + [300] + [Double](repeating: 50, count: 6)
        XCTAssertLessThan(try ACWR.series(load, method: .ewma).ratio.last!, try ACWR.series(load, method: .rac).ratio.last!)
    }

    // MARK: edge cases that should not silently produce a number

    func testZeroChronicLoadGivesInfNotAMadeUpNumber() throws {
        let load = [Double](repeating: 0, count: 28) + [Double](repeating: 10, count: 7)
        XCTAssert(try ACWR.series(load, method: .rau).ratio.last!.isInfinite)
    }

    func testNoTrainingAtAllGivesNaN() throws {
        XCTAssert(try ACWR.series([Double](repeating: 0, count: 40)).ratio.last!.isNaN)
    }

    func testChronicMustExceedAcute() {
        let load = [Double](repeating: 50, count: 40)
        XCTAssertThrowsError(try ACWR.series(load, acute: 7, chronic: 7))
        XCTAssertThrowsError(try ACWR.series(load, acute: 28, chronic: 7))
        XCTAssertThrowsError(try ACWR.series([]))
    }

    func testCoupledRatioCanNeverExceedChronicOverAcute() throws {
        // RAC = (c/a) * (S_a / S_c) and S_a <= S_c, so the ceiling is 4.0 at 7/28.
        let load = ref.lumpy900.load
        for v in try ACWR.series(load, method: .rac).ratio where v.isFinite {
            XCTAssertLessThanOrEqual(v, 4.0 + 1e-9)
        }
        let spike = [Double](repeating: 0, count: 28) + [Double](repeating: 10, count: 7)
        XCTAssertEqual(try ACWR.series(spike, method: .rac).ratio.last!, 4.0, accuracy: 1e-12)
    }

    // MARK: the Python reference, to nine decimal places

    func testGamma400MatchesPythonForAllThreeMethods() throws {
        let s = ref.gamma400
        for (method, comp) in [(ACWRMethod.rac, s.rac!), (.rau, s.rau!), (.ewma, s.ewma!)] {
            let ours = try ACWR.series(s.load, method: method)
            assertSeriesMatch(ours.acute, comp.acute, "gamma400 \(method) acute")
            assertSeriesMatch(ours.chronic, comp.chronic, "gamma400 \(method) chronic")
            assertSeriesMatch(ours.ratio, comp.acwr, "gamma400 \(method) acwr")
        }
        // The headline number from the brief: day 400 of the seeded gamma series.
        XCTAssertEqual(try ACWR.series(s.load).ratio.last!, s.rac!.acwr.last!.double, accuracy: 1e-9)
    }

    func testRhythm500WithRestDaysMatchesPython() throws {
        let s = ref.rhythm500
        assertSeriesMatch(try ACWR.series(s.load, method: .rac).ratio, s.rac!.acwr, "rhythm500 rac acwr")
        assertSeriesMatch(try ACWR.series(s.load, method: .ewma).ratio, s.ewma!.acwr, "rhythm500 ewma acwr")
    }

    func testLumpy900WithLayoffsMatchesPythonIncludingInfinities() throws {
        let s = ref.lumpy900
        assertSeriesMatch(try ACWR.series(s.load, method: .rac).ratio, s.rac!.acwr, "lumpy900 rac acwr")
        assertSeriesMatch(try ACWR.series(s.load, method: .rau).ratio, s.rau!.acwr, "lumpy900 rau acwr")
    }
}
