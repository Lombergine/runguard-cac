//
//  StatisticsTests.swift — Statistics against numpy/scipy conventions.
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import XCTest
@testable import RunGuardCore

final class StatisticsTests: XCTestCase {
    let ref = Reference.shared

    func testPercentileMatchesNumpyLinearInterpolation() {
        for (p, expected) in ref.stats.percentiles {
            XCTAssertEqual(Statistics.percentile(ref.stats.arr, Double(p)!), expected, accuracy: 1e-12, "p\(p)")
        }
    }

    func testPercentileOfSingleValueIsThatValue() {
        XCTAssertEqual(Statistics.percentile([4.2], 95), 4.2)
        XCTAssert(Statistics.percentile([], 50).isNaN)
    }

    func testRanksAverageTiesLikeScipy() {
        // [3,1,4,1,5] → 1s share positions 1 and 2 → 1.5 each
        XCTAssertEqual(Statistics.ranks([3, 1, 4, 1, 5]), [3, 1.5, 4, 1.5, 5])
    }

    func testSpearmanAndPearsonMatchScipy() {
        let idx = (0..<ref.stats.arr.count).map(Double.init)
        XCTAssertEqual(Statistics.spearman(ref.stats.arr, idx), ref.stats.spearman_vs_index, accuracy: 1e-12)
        XCTAssertEqual(Statistics.pearson(ref.stats.arr, idx), ref.stats.pearson_vs_index, accuracy: 1e-12)
    }

    func testConstantSideGivesNaNNotACrash() {
        XCTAssert(Statistics.pearson([1, 1, 1], [1, 2, 3]).isNaN)
    }

    func testSampleStandardDeviation() {
        XCTAssertEqual(Statistics.standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]), 2.138089935299395, accuracy: 1e-12)
        XCTAssertEqual(Statistics.standardDeviation([2, 4, 4, 4, 5, 5, 7, 9], ddof: 0), 2.0, accuracy: 1e-12)
    }

    func testSeededGeneratorIsReproducible() {
        var a = SplitMix64(seed: 7), b = SplitMix64(seed: 7)
        XCTAssertEqual((0..<5).map { _ in a.next() }, (0..<5).map { _ in b.next() })
    }
}
