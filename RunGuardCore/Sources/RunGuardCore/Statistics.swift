//
//  Statistics.swift
//  RunGuardCore
//
//  The handful of descriptive statistics the diagnostics need, written to
//  match numpy and scipy conventions exactly: percentiles use numpy's default
//  linear interpolation, ranks average ties the way scipy.stats.rankdata
//  does, and Spearman is Pearson on those ranks. Matching the reference
//  implementation is the point — the tests compare against it to 1e-9.
//
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import Foundation

public enum Statistics {
    /// Arithmetic mean. NaN for an empty array, like numpy.
    public static func mean(_ x: [Double]) -> Double {
        guard !x.isEmpty else { return .nan }
        return x.reduce(0, +) / Double(x.count)
    }

    /// Standard deviation with `ddof` degrees of freedom removed. The default
    /// `ddof = 1` is the sample standard deviation (pandas' default); numpy's
    /// default is `ddof = 0`.
    public static func standardDeviation(_ x: [Double], ddof: Int = 1) -> Double {
        guard x.count > ddof else { return .nan }
        let m = mean(x)
        let ss = x.reduce(0) { $0 + ($1 - m) * ($1 - m) }
        return (ss / Double(x.count - ddof)).squareRoot()
    }

    /// The 50th percentile.
    public static func median(_ x: [Double]) -> Double {
        percentile(x, 50)
    }

    /// Percentile with numpy's default `linear` interpolation: the sorted
    /// array is indexed at `p / 100 * (n - 1)` and the two neighbouring
    /// values are interpolated. NaN for an empty array.
    public static func percentile(_ x: [Double], _ p: Double) -> Double {
        guard !x.isEmpty else { return .nan }
        let sorted = x.sorted()
        let n = sorted.count
        if n == 1 { return sorted[0] }
        let rank = (p / 100.0) * Double(n - 1)
        let lo = Int(rank.rounded(.down))
        let hi = Int(rank.rounded(.up))
        if lo == hi { return sorted[lo] }
        let frac = rank - Double(lo)
        return sorted[lo] + (sorted[hi] - sorted[lo]) * frac
    }

    /// Ranks starting at 1, with tied values given the average of the
    /// positions they occupy (scipy's `rankdata(method="average")`).
    public static func ranks(_ x: [Double]) -> [Double] {
        let n = x.count
        guard n > 0 else { return [] }
        let order = x.indices.sorted { x[$0] < x[$1] }
        var out = [Double](repeating: 0, count: n)
        var i = 0
        while i < n {
            var j = i
            while j + 1 < n, x[order[j + 1]] == x[order[i]] { j += 1 }
            // positions i+1 ... j+1 (1-based) share the average rank
            let avg = Double(i + 1 + j + 1) / 2.0
            for k in i...j { out[order[k]] = avg }
            i = j + 1
        }
        return out
    }

    /// Pearson correlation. NaN when either side is constant or the arrays
    /// have fewer than two paired values.
    public static func pearson(_ x: [Double], _ y: [Double]) -> Double {
        precondition(x.count == y.count, "pearson needs paired arrays")
        let n = x.count
        guard n >= 2 else { return .nan }
        let mx = mean(x), my = mean(y)
        var sxy = 0.0, sxx = 0.0, syy = 0.0
        for i in 0..<n {
            let dx = x[i] - mx, dy = y[i] - my
            sxy += dx * dy
            sxx += dx * dx
            syy += dy * dy
        }
        guard sxx > 0, syy > 0 else { return .nan }
        return sxy / (sxx * syy).squareRoot()
    }

    /// Spearman rank correlation: Pearson on the average-tied ranks.
    public static func spearman(_ x: [Double], _ y: [Double]) -> Double {
        pearson(ranks(x), ranks(y))
    }
}
