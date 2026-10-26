//
//  Diagnostics.swift
//  RunGuardCore
//
//  Tests of whether an ACWR is telling you anything, ported from
//  `acwr.diagnostics` (Lombergine/acwr).
//
//  Impellizzeri et al. (2021) showed that replacing the chronic denominator
//  with noise barely changed the ratio's association with injury: the
//  denominator was not doing work, and what remained was acute load on a
//  different scale. `rescalingCheck` runs the label-free version of that
//  test on an athlete's own data — how closely does the ratio track its own
//  numerator? A Spearman near 1.0 means the score is mostly repeating the
//  last seven days of training.
//
//  `thresholdFromHistory` puts the universal 1.5 cutoff next to the athlete
//  it is being applied to: what share of their days it flags, where it sits
//  in their own distribution, and what cut would flag their hardest 5%.
//  A threshold chosen from the athlete's own history flags a fixed share of
//  their days by construction, whatever their training was like. It makes
//  the arbitrariness of the universal number visible; it is not a validated
//  replacement for it.
//
//  Reference: Impellizzeri, F. M., Woodcock, S., Coutts, A. J., Fanchini,
//  M., McCall, A., & Vigotsky, A. D. (2021). What role do chronic workloads
//  play in the acute to chronic workload ratio? Time to dismiss ACWR and its
//  underlying theory. Sports Medicine, 51(3), 581-592.
//
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import Foundation

public enum DiagnosticsError: Error, Equatable {
    /// Fewer than three days carry both a finite acute load and ratio.
    case notEnoughUsableDays(Int)
    /// Every day is still inside the warm-up.
    case noUsableDays
    /// Every usable ratio is infinite; percentiles are undefined.
    case allInfinite
}

/// How much of the ratio is explained by its own numerator.
public struct RescalingResult: Sendable, Equatable {
    public let method: ACWRMethod
    /// Days with a finite acute load and ratio.
    public let n: Int
    public let spearman: Double
    public let pearson: Double
    /// Bootstrap 95% interval on the Spearman (percentile method). NaN when
    /// fewer than ten resamples were usable.
    public let spearmanCILow: Double
    public let spearmanCIHigh: Double
    public let bootstrapDraws: Int
    public let seed: UInt64
}

/// What a universal threshold means for one athlete's own distribution.
public struct ThresholdReport: Sendable, Equatable {
    public let method: ACWRMethod
    /// Usable days: every day with a defined ratio, infinite ones included.
    public let n: Int
    /// Percentiles of the finite ratios, keyed by the percentile asked for.
    public let percentiles: [Double: Double]
    public let reference: Double
    /// Usable days strictly above `reference`. Infinite days count.
    public let referenceFlagged: Int

    /// Share of this athlete's usable days the reference flags.
    public var referenceFlaggedFraction: Double {
        n > 0 ? Double(referenceFlagged) / Double(n) : .nan
    }

    /// Where the reference sits in this athlete's own history.
    public var referencePercentile: Double {
        100.0 * (1.0 - referenceFlaggedFraction)
    }

    public func percentile(_ p: Double) -> Double? { percentiles[p] }
}

public enum Diagnostics {
    /// Minimum usable days before the check runs at all.
    public static let minimumUsableDays = 3
    /// Below this the number is computable but not worth reading; the UI
    /// shows a "not enough history" state instead.
    public static let recommendedUsableDays = 60

    /// Correlate the ratio against the acute load on its own.
    public static func rescalingCheck(
        _ load: [Double], acute: Int = 7, chronic: Int = 28, method: ACWRMethod = .rac,
        draws: Int = 2000, seed: UInt64 = 0
    ) throws -> RescalingResult {
        let s = try ACWR.series(load, acute: acute, chronic: chronic, method: method)
        var a: [Double] = [], r: [Double] = []
        for i in s.ratio.indices where s.acute[i].isFinite && s.ratio[i].isFinite {
            a.append(s.acute[i])
            r.append(s.ratio[i])
        }
        guard a.count >= minimumUsableDays else { throw DiagnosticsError.notEnoughUsableDays(a.count) }
        let ci = spearmanCI(a, r, draws: draws, seed: seed)
        return RescalingResult(
            method: method, n: a.count,
            spearman: Statistics.spearman(a, r),
            pearson: Statistics.pearson(a, r),
            spearmanCILow: ci.0, spearmanCIHigh: ci.1,
            bootstrapDraws: draws, seed: seed
        )
    }

    /// Percentile bootstrap: resample (acute, ratio) pairs with replacement,
    /// recompute Spearman each time, take the 2.5th and 97.5th percentiles.
    /// A resample where either side is constant has no correlation and is
    /// skipped, as in the reference implementation.
    static func spearmanCI(_ x: [Double], _ y: [Double], draws: Int, seed: UInt64) -> (Double, Double) {
        var rng = SplitMix64(seed: seed)
        let n = x.count
        var out: [Double] = []
        out.reserveCapacity(draws)
        var xs = [Double](repeating: 0, count: n)
        var ys = [Double](repeating: 0, count: n)
        for _ in 0..<draws {
            for k in 0..<n {
                let i = Int.random(in: 0..<n, using: &rng)
                xs[k] = x[i]
                ys[k] = y[i]
            }
            if Set(xs).count < 2 || Set(ys).count < 2 { continue }
            out.append(Statistics.spearman(xs, ys))
        }
        guard out.count >= 10 else { return (.nan, .nan) }
        return (Statistics.percentile(out, 2.5), Statistics.percentile(out, 97.5))
    }

    /// Put a universal threshold next to the athlete it is applied to.
    public static func thresholdFromHistory(
        _ load: [Double], percentiles: [Double] = [50, 75, 90, 95, 99],
        acute: Int = 7, chronic: Int = 28, method: ACWRMethod = .rac, reference: Double = 1.5
    ) throws -> ThresholdReport {
        let s = try ACWR.series(load, acute: acute, chronic: chronic, method: method)
        let usable = s.ratio.filter { !$0.isNaN }
        guard !usable.isEmpty else { throw DiagnosticsError.noUsableDays }
        let finite = usable.filter { $0.isFinite }
        guard !finite.isEmpty else { throw DiagnosticsError.allInfinite }
        var values: [Double: Double] = [:]
        for p in percentiles { values[p] = Statistics.percentile(finite, p) }
        return ThresholdReport(
            method: method, n: usable.count, percentiles: values,
            reference: reference, referenceFlagged: usable.filter { $0 > reference }.count
        )
    }
}
