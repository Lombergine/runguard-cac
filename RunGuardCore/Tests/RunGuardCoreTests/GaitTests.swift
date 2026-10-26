//
//  GaitTests.swift — the gait drift heuristic and its sample dataset.
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import XCTest
@testable import RunGuardCore

final class GaitTests: XCTestCase {
    let now = isoDate("2026-10-25")

    func testSampleDatasetFlagsMechanicalDriftAtUnchangedPace() {
        let runs = SampleGaitData.sixWeeksWithDrift(asOf: now, calendar: utc)
        XCTAssertEqual(runs.count, 24, "six weeks, four runs a week")
        guard case .analyzed(let d) = Gait.analyze(runs: runs, asOf: now, calendar: utc) else {
            return XCTFail("expected an analysis")
        }
        XCTAssertEqual(d.recentRuns, 4)
        XCTAssertEqual(d.baselineRuns, 16)
        XCTAssertGreaterThan(d.groundContactDrift!, 0.05)
        XCTAssertLessThan(d.verticalOscillationDrift!, 0.08)
        XCTAssertLessThan(abs(d.speedChange!), 0.02)
        XCTAssert(d.flagsMechanicalDrift)
        XCTAssertEqual(d.reasons.count, 1)
        XCTAssert(d.reasons[0].hasPrefix("Ground contact time up"))
    }

    func testSteadySampleDoesNotFlag() {
        let runs = SampleGaitData.sixWeeksSteady(asOf: now, calendar: utc)
        guard case .analyzed(let d) = Gait.analyze(runs: runs, asOf: now, calendar: utc) else {
            return XCTFail("expected an analysis")
        }
        XCTAssertFalse(d.flagsMechanicalDrift)
        XCTAssertLessThan(abs(d.groundContactDrift!), 0.05)
    }

    func testAFasterWeekExplainsLongerContactSoNoFlag() {
        let runs = SampleGaitData.sixWeeksWithDrift(asOf: now, calendar: utc).map { r in
            let recent = utc.dateComponents([.day], from: r.date, to: now).day! < 7
            return GaitRun(id: r.id, date: r.date, groundContactMs: r.groundContactMs,
                           verticalOscillationCm: r.verticalOscillationCm,
                           speedMetersPerSecond: recent ? r.speedMetersPerSecond! * 1.10 : r.speedMetersPerSecond,
                           sampleCount: r.sampleCount)
        }
        guard case .analyzed(let d) = Gait.analyze(runs: runs, asOf: now, calendar: utc) else {
            return XCTFail("expected an analysis")
        }
        XCTAssertFalse(d.flagsMechanicalDrift)
        XCTAssert(d.reasons.contains { $0.contains("faster this week") })
    }

    func testRunsWithoutDynamicsGiveNoDynamicsState() {
        let runs = [GaitRun(date: now, groundContactMs: nil, verticalOscillationCm: nil, speedMetersPerSecond: 3.3, sampleCount: 0)]
        XCTAssertEqual(Gait.analyze(runs: runs, asOf: now, calendar: utc), .noDynamics)
        XCTAssertEqual(Gait.analyze(runs: [], asOf: now, calendar: utc), .noDynamics)
    }

    func testTooFewBaselineRunsIsSaidNotGuessed() {
        let runs = SampleGaitData.sixWeeksWithDrift(asOf: now, calendar: utc).suffix(6)
        XCTAssertEqual(Gait.analyze(runs: Array(runs), asOf: now, calendar: utc), .insufficientBaseline(runs: 2, needed: 4))
    }

    func testBaselineWithoutARecentRunIsReported() {
        let runs = SampleGaitData.sixWeeksWithDrift(asOf: now, calendar: utc).filter {
            utc.dateComponents([.day], from: $0.date, to: now).day! >= 7
        }
        XCTAssertEqual(Gait.analyze(runs: runs, asOf: now, calendar: utc), .noRecentRuns)
    }

    func testBaselineIsUncoupledFromTheRecentWeek() {
        // Doubling contact time in the recent week must not move the baseline.
        let base = SampleGaitData.sixWeeksSteady(asOf: now, calendar: utc)
        let doubled = base.map { r in
            let recent = utc.dateComponents([.day], from: r.date, to: now).day! < 7
            return GaitRun(id: r.id, date: r.date, groundContactMs: recent ? r.groundContactMs! * 2 : r.groundContactMs,
                           verticalOscillationCm: r.verticalOscillationCm,
                           speedMetersPerSecond: r.speedMetersPerSecond, sampleCount: r.sampleCount)
        }
        guard case .analyzed(let a) = Gait.analyze(runs: base, asOf: now, calendar: utc),
              case .analyzed(let b) = Gait.analyze(runs: doubled, asOf: now, calendar: utc) else {
            return XCTFail("expected analyses")
        }
        XCTAssertEqual(a.baselineGroundContactMs!, b.baselineGroundContactMs!, accuracy: 1e-12)
        XCTAssert(b.flagsMechanicalDrift)
    }
}
