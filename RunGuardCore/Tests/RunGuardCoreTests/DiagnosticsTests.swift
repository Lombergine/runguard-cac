//
//  DiagnosticsTests.swift — rescaling check and personal threshold against
//  the Python reference. Port of the relevant parts of test_diagnostics.py.
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import XCTest
@testable import RunGuardCore

final class DiagnosticsTests: XCTestCase {
    let ref = Reference.shared

    private func check(_ s: RefSeries, _ d: RefDiagnostics, method: ACWRMethod, label: String) throws {
        let r = try Diagnostics.rescalingCheck(s.load, method: method, draws: 2000, seed: 0)
        XCTAssertEqual(r.n, d.rescaling.n, "\(label) n")
        XCTAssertEqual(r.pearson, d.rescaling.pearson, accuracy: 1e-9, "\(label) pearson")
        // Spearman is discontinuous at ties. With rest days, consecutive
        // 7-day windows often hold the same single training day and are
        // mathematically tied. pandas forms its rolling mean with a running
        // add/subtract sum, so those ties come out a few ulps apart and get
        // distinct ranks; this port sums each window directly and gets exact
        // ties with averaged ranks. Rounding the Python arrays to 9 dp
        // restores the ties, and that value is what we must hit to 1e-9. The
        // raw pandas number agrees to 1e-6, the size of one rank swap.
        XCTAssertEqual(r.spearman, d.rescaling.spearman_ties_resolved, accuracy: 1e-9, "\(label) spearman (ties resolved)")
        XCTAssertEqual(r.spearman, d.rescaling.spearman, accuracy: 1e-6, "\(label) spearman (raw pandas)")
        // The bootstrap uses a different generator from numpy, so the
        // interval agrees to about two decimals, and must bracket the point.
        XCTAssertLessThan(r.spearmanCILow, r.spearman, "\(label) ci low")
        XCTAssertGreaterThan(r.spearmanCIHigh, r.spearman, "\(label) ci high")
        XCTAssertEqual(r.spearmanCILow, d.rescaling.spearman_ci95[0], accuracy: 0.02, "\(label) ci low vs python")
        XCTAssertEqual(r.spearmanCIHigh, d.rescaling.spearman_ci95[1], accuracy: 0.02, "\(label) ci high vs python")
        print("\(label): spearman \(r.spearman) [\(r.spearmanCILow), \(r.spearmanCIHigh)] python [\(d.rescaling.spearman_ci95[0]), \(d.rescaling.spearman_ci95[1])]")

        let t = try Diagnostics.thresholdFromHistory(s.load, method: method)
        XCTAssertEqual(t.n, d.threshold.n, "\(label) usable")
        XCTAssertEqual(t.referenceFlagged, d.threshold.reference_flagged, "\(label) flagged")
        XCTAssertEqual(t.referenceFlaggedFraction, d.threshold.reference_flagged_fraction, accuracy: 1e-12)
        XCTAssertEqual(t.referencePercentile, d.threshold.reference_percentile, accuracy: 1e-9)
        for (p, v) in d.threshold.percentiles {
            XCTAssertEqual(t.percentile(Double(p)!)!, v, accuracy: 1e-9, "\(label) p\(p)")
        }
    }

    func testGamma400RescalingAndThresholdMatchPython() throws {
        try check(ref.gamma400, ref.gamma400.diagnostics_rac!, method: .rac, label: "gamma400 rac")
        try check(ref.gamma400, ref.gamma400.diagnostics_ewma!, method: .ewma, label: "gamma400 ewma")
    }

    func testRhythm500MatchesPython() throws {
        try check(ref.rhythm500, ref.rhythm500.diagnostics_rac!, method: .rac, label: "rhythm500 rac")
    }

    func testLumpy900MatchesPythonForCoupledAndUncoupled() throws {
        try check(ref.lumpy900, ref.lumpy900.diagnostics_rac!, method: .rac, label: "lumpy900 rac")
        try check(ref.lumpy900, ref.lumpy900.diagnostics_rau!, method: .rau, label: "lumpy900 rau")
    }

    func testNoisyTrainingRescalesAboveZeroPointEight() throws {
        // The docstring example: on noisy day-to-day training the ratio tracks
        // the acute load closely, which is exactly the critique's point.
        XCTAssertGreaterThan(try Diagnostics.rescalingCheck(ref.gamma400.load).spearman, 0.8)
    }

    func testAConstantDenominatorMakesTheRatioACopyOfTheNumerator() throws {
        // The limiting case: divide the acute load by a constant and the
        // ordering of days is preserved perfectly. Spearman is exactly 1.
        let s = try ACWR.series(ref.rhythm500.load)
        let acute = s.acute.filter { !$0.isNaN }
        let constant = Statistics.mean(s.chronic.filter { !$0.isNaN })
        let ratio = acute.map { $0 / constant }
        XCTAssertEqual(Statistics.spearman(acute, ratio), 1.0, accuracy: 1e-12)
    }

    func testSmootherLoadRescalesMoreThanStructuredLoad() throws {
        var rng = SplitMix64(seed: 3)
        let flat = (0..<600).map { _ in 100.0 + (Double(rng.next() % 1000) / 1000.0 - 0.5) * 6.0 }
        XCTAssertGreaterThan(try Diagnostics.rescalingCheck(flat).spearman,
                             try Diagnostics.rescalingCheck(ref.rhythm500.load).spearman)
    }

    func testRescalingCheckNeedsEnoughDaysAndSaysSo() {
        XCTAssertThrowsError(try Diagnostics.rescalingCheck([Double](repeating: 50, count: 20))) { error in
            XCTAssertEqual(error as? DiagnosticsError, .notEnoughUsableDays(0))
        }
    }

    func testBootstrapIsReproducibleFromASeed() throws {
        let a = try Diagnostics.rescalingCheck(ref.rhythm500.load, draws: 300, seed: 1)
        let b = try Diagnostics.rescalingCheck(ref.rhythm500.load, draws: 300, seed: 1)
        XCTAssertEqual(a, b)
    }

    func testPercentilesAreOrderedAndComeFromTheRatioItself() throws {
        let t = try Diagnostics.thresholdFromHistory(ref.lumpy900.load, percentiles: [50, 90, 99])
        let values = [50.0, 90.0, 99.0].map { t.percentile($0)! }
        XCTAssertEqual(values, values.sorted())
        let finite = try ACWR.series(ref.lumpy900.load).ratio.filter(\.isFinite)
        XCTAssertEqual(t.percentile(50)!, Statistics.median(finite), accuracy: 1e-12)
    }

    func testAHigherReferenceFlagsFewerDays() throws {
        let low = try Diagnostics.thresholdFromHistory(ref.lumpy900.load, reference: 1.2)
        let high = try Diagnostics.thresholdFromHistory(ref.lumpy900.load, reference: 2.0)
        XCTAssertGreaterThanOrEqual(low.referenceFlagged, high.referenceFlagged)
        XCTAssertEqual(low.n, high.n)
    }

    func testInfiniteDaysCountAsFlaggedButDoNotEnterThePercentiles() throws {
        let load = [Double](repeating: 0, count: 40) + [Double](repeating: 20, count: 200)
        let t = try Diagnostics.thresholdFromHistory(load, method: .rau)
        XCTAssert(t.percentiles.values.allSatisfy(\.isFinite))
        let infinite = try ACWR.series(load, method: .rau).ratio.filter(\.isInfinite).count
        XCTAssertGreaterThan(infinite, 0)
        XCTAssertGreaterThanOrEqual(t.referenceFlagged, infinite)
    }

    func testASeriesTooShortToProduceARatioIsAnError() {
        XCTAssertThrowsError(try Diagnostics.thresholdFromHistory([Double](repeating: 10, count: 20))) { error in
            XCTAssertEqual(error as? DiagnosticsError, .noUsableDays)
        }
    }
}
