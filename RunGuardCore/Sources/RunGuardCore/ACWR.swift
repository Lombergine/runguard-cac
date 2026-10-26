//
//  ACWR.swift
//  RunGuardCore
//
//  The three published forms of the acute:chronic workload ratio, ported
//  from `acwr.ratio` (Lombergine/acwr). All three divide a short-term load
//  average by a long-term one; they differ in how the averages are formed.
//
//  - rac: rolling average, coupled. The original and most reported form.
//    The 28-day chronic window contains the 7-day acute window, so today's
//    load appears in both numerator and denominator (Impellizzeri 2020).
//  - rau: rolling average, uncoupled. Chronic is the 21 days before the
//    acute week, so the two windows share no days.
//  - ewma: exponentially weighted, alpha = 2 / (N + 1) (Williams 2017).
//
//  Every method warms up for a full chronic window: the first 27 days are
//  NaN rather than computed from a partial history. A chronic load of zero
//  gives +inf when acute is positive and NaN when both are zero — a division
//  by zero is reported as what it is, not replaced with a number.
//
//  None of these is endorsed as a predictor of injury. See Diagnostics.
//
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import Foundation

public enum ACWRMethod: String, Codable, Sendable, CaseIterable {
    case rac, rau, ewma

    public var displayName: String {
        switch self {
        case .rac: "rolling average, coupled"
        case .rau: "rolling average, uncoupled"
        case .ewma: "exponentially weighted"
        }
    }
}

public enum ACWRError: Error, Equatable {
    case emptySeries
    case acuteTooShort
    case chronicMustExceedAcute(acute: Int, chronic: Int)
}

/// The ratio and both of its legs, aligned to the input day by day.
public struct ACWRSeries: Sendable, Equatable {
    public let method: ACWRMethod
    public let acuteWindow: Int
    public let chronicWindow: Int
    public let load: [Double]
    /// NaN during the warm-up.
    public let acute: [Double]
    public let chronic: [Double]
    /// NaN during warm-up or where both legs are zero; +inf where chronic is
    /// zero and acute is positive.
    public let ratio: [Double]

    /// Days with a defined (non-NaN) ratio, including infinite ones.
    public var usableIndices: [Int] { ratio.indices.filter { !ratio[$0].isNaN } }
    /// Days with a finite ratio.
    public var finiteIndices: [Int] { ratio.indices.filter { ratio[$0].isFinite } }
}

public enum ACWR {
    /// Williams et al. (2017): lambda = 2 / (N + 1).
    public static func alpha(span n: Int) -> Double {
        2.0 / (Double(n) + 1.0)
    }

    /// Trailing mean over `window` days ending at each index, NaN until a
    /// full window is available.
    static func rollingMean(_ x: [Double], window: Int, minPeriods: Int) -> [Double] {
        var out = [Double](repeating: .nan, count: x.count)
        for i in x.indices {
            let lo = max(0, i - window + 1)
            let count = i - lo + 1
            if count >= minPeriods {
                var sum = 0.0
                for k in lo...i { sum += x[k] }
                out[i] = sum / Double(count)
            }
        }
        return out
    }

    /// pandas `ewm(alpha:, adjust: false)`: s_0 = x_0, s_t = (1-a) s_{t-1} + a x_t,
    /// masked to NaN until `minPeriods` observations have been seen.
    static func ewma(_ x: [Double], alpha: Double, minPeriods: Int) -> [Double] {
        var out = [Double](repeating: .nan, count: x.count)
        guard !x.isEmpty else { return out }
        var s = x[0]
        for i in x.indices {
            if i > 0 { s = (1 - alpha) * s + alpha * x[i] }
            if i + 1 >= minPeriods { out[i] = s }
        }
        return out
    }

    /// Short-term load average.
    public static func acuteLoad(
        _ load: [Double], acute: Int = 7, method: ACWRMethod = .rac, minPeriods: Int? = nil
    ) throws -> [Double] {
        guard !load.isEmpty else { throw ACWRError.emptySeries }
        guard acute >= 1 else { throw ACWRError.acuteTooShort }
        let mp = minPeriods ?? acute
        switch method {
        case .ewma: return ewma(load, alpha: alpha(span: acute), minPeriods: mp)
        case .rac, .rau: return rollingMean(load, window: acute, minPeriods: mp)
        }
    }

    /// Long-term load average. The window depends on the method: `rac`
    /// averages the last `chronic` days including today; `rau` averages the
    /// `chronic - acute` days that end the day before the acute window
    /// begins; `ewma` decays with alpha = 2 / (chronic + 1). All three warm
    /// up for `chronic` days so they are comparable on the same days.
    public static func chronicLoad(
        _ load: [Double], acute: Int = 7, chronic: Int = 28,
        method: ACWRMethod = .rac, minPeriods: Int? = nil
    ) throws -> [Double] {
        guard !load.isEmpty else { throw ACWRError.emptySeries }
        guard acute >= 1 else { throw ACWRError.acuteTooShort }
        guard chronic > acute else { throw ACWRError.chronicMustExceedAcute(acute: acute, chronic: chronic) }
        switch method {
        case .ewma:
            return ewma(load, alpha: alpha(span: chronic), minPeriods: minPeriods ?? chronic)
        case .rac:
            return rollingMean(load, window: chronic, minPeriods: minPeriods ?? chronic)
        case .rau:
            let window = chronic - acute
            let mp = minPeriods ?? window
            // Shift the series forward by `acute` days, then take the
            // trailing mean, so the chronic window ends the day before the
            // acute window starts and the two share no days.
            var shifted = [Double](repeating: .nan, count: load.count)
            for i in load.indices where i - acute >= 0 { shifted[i] = load[i - acute] }
            var out = [Double](repeating: .nan, count: load.count)
            for i in load.indices {
                let lo = max(0, i - window + 1)
                let slice = shifted[lo...i].filter { !$0.isNaN }
                if slice.count >= mp, slice.count == i - lo + 1 {
                    out[i] = slice.reduce(0, +) / Double(slice.count)
                }
            }
            return out
        }
    }

    /// The ratio with both of its components.
    public static func series(
        _ load: [Double], acute: Int = 7, chronic: Int = 28, method: ACWRMethod = .rac
    ) throws -> ACWRSeries {
        let a = try acuteLoad(load, acute: acute, method: method)
        let c = try chronicLoad(load, acute: acute, chronic: chronic, method: method)
        // IEEE division does the right thing: x/0 = inf, 0/0 = nan, nan/x = nan.
        let r = zip(a, c).map { $0 / $1 }
        return ACWRSeries(
            method: method, acuteWindow: acute, chronicWindow: chronic,
            load: load, acute: a, chronic: c, ratio: r
        )
    }
}
