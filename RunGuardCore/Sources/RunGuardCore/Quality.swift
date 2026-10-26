//
//  Quality.swift
//  RunGuardCore
//
//  Pre-flight checks on a training log before anything is computed from it,
//  ported from `acwr.quality` (Lombergine/acwr). Every number downstream
//  inherits whatever is wrong with the series it was given, and logs are
//  wrong in a small number of reliable ways: a watch left running records a
//  389-minute 1.28 km run; a season break looks identical to a month the
//  athlete forgot to sync; a change of recording unit produces a step no
//  rolling window survives.
//
//  Nothing here is corrected automatically. Whether a thirty-day gap was a
//  planned break or a month of unsynced training is a question for the
//  athlete, not for a library.
//
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import Foundation

public enum QualityCheck: String, Sendable, Codable, CaseIterable {
    case history
    case noTraining = "no training"
    case negativeLoad = "negative load"
    case unobservedDays = "unobserved days"
    case outlierDays = "outlier days"
    case suspectedUnitChange = "suspected unit change"
    case extremeDynamicRange = "extreme dynamic range"
    case `break`
    case mostlyRest = "mostly rest"
    case fewUsableDays = "few usable days"
    case constantLoad = "constant load"
}

public enum Severity: String, Sendable, Codable, Comparable {
    case note, warning, error

    public static func < (a: Severity, b: Severity) -> Bool {
        let order: [Severity] = [.note, .warning, .error]
        return order.firstIndex(of: a)! < order.firstIndex(of: b)!
    }
}

/// One thing worth knowing about a load series before using it.
public struct Finding: Sendable, Equatable, Identifiable {
    public var id: String { "\(check.rawValue)-\(dayIndices.first ?? -1)" }
    public let check: QualityCheck
    public let severity: Severity
    /// Plain-language description with the numbers in it. Dates are left to
    /// the caller, who knows the calendar; `dayIndices` points at them.
    public let message: String
    /// Indices into the load series this finding is about (at most five).
    public let dayIndices: [Int]
}

/// What `Quality.checkLoad` found, and whether anything is disqualifying.
public struct LoadQuality: Sendable, Equatable {
    public let nDays: Int
    public let nTrainingDays: Int
    public let findings: [Finding]

    /// Findings that make a computed ratio meaningless rather than suspect.
    public var errors: [Finding] { findings.filter { $0.severity == .error } }
    /// Findings that change the answer without invalidating it.
    public var warnings: [Finding] { findings.filter { $0.severity == .warning } }
    public var notes: [Finding] { findings.filter { $0.severity == .note } }
    /// True when nothing disqualifying was found. A series can be ok and
    /// still carry warnings.
    public var ok: Bool { errors.isEmpty }
}

public enum Quality {
    /// Report what is wrong, or merely surprising, about a daily load series.
    ///
    /// - error: no training at all, history shorter than the chronic window,
    ///   negative loads.
    /// - warning: NaN days, outliers (> `outlierFactor` × the 95th percentile
    ///   training day), a suspected unit change (median of one half of the
    ///   series differs from the other by > `unitShiftFactor`), extreme
    ///   dynamic range, a break of ≥ `breakDays` zero days.
    /// - note: mostly rest, few usable days, constant load.
    public static func checkLoad(
        _ load: [Double], acute: Int = 7, chronic: Int = 28,
        breakDays: Int = 10, outlierFactor: Double = 3.0, unitShiftFactor: Double = 50.0
    ) -> LoadQuality {
        var findings: [Finding] = []
        let nDays = load.count
        let observedIdx = load.indices.filter { !load[$0].isNaN }
        let trainingIdx = observedIdx.filter { load[$0] > 0 }
        let training = trainingIdx.map { load[$0] }
        let nTraining = training.count

        // --- things that make the computation meaningless -----------------
        if nDays < chronic {
            findings.append(Finding(
                check: .history, severity: .error,
                message: "\(nDays) days of history is shorter than the \(chronic) day chronic window",
                dayIndices: []))
        }
        if nTraining == 0 {
            findings.append(Finding(
                check: .noTraining, severity: .error,
                message: "every observed day is zero or missing", dayIndices: []))
        }
        let negative = observedIdx.filter { load[$0] < 0 }
        if !negative.isEmpty {
            findings.append(Finding(
                check: .negativeLoad, severity: .error,
                message: "\(negative.count) day(s) carry a negative load",
                dayIndices: Array(negative.prefix(5))))
        }

        // --- things that change the answer ----------------------------------
        let missing = load.indices.filter { load[$0].isNaN }
        if !missing.isEmpty {
            findings.append(Finding(
                check: .unobservedDays, severity: .warning,
                message: "\(missing.count) day(s) are unobserved rather than zero, so every window touching them is undefined",
                dayIndices: Array(missing.prefix(5))))
        }

        if nTraining >= 10 {
            let upper = Statistics.percentile(training, 95)
            let big = trainingIdx.filter { load[$0] > outlierFactor * upper }
            if !big.isEmpty {
                let largest = big.map { load[$0] }.max()!
                let top = big.sorted { load[$0] > load[$1] }.prefix(5)
                findings.append(Finding(
                    check: .outlierDays, severity: .warning,
                    message: "\(big.count) day(s) exceed \(format(outlierFactor)) times the 95th percentile training day of \(format(upper)), the largest being \(format(largest))",
                    dayIndices: Array(top)))
            }

            let half = nDays / 2
            let first = trainingIdx.filter { $0 < half }.map { load[$0] }
            let second = trainingIdx.filter { $0 >= half }.map { load[$0] }
            if first.count >= 5, second.count >= 5 {
                let a = Statistics.median(first), b = Statistics.median(second)
                let lo = min(a, b), hi = max(a, b)
                if lo > 0, hi / lo > unitShiftFactor {
                    findings.append(Finding(
                        check: .suspectedUnitChange, severity: .warning,
                        message: "the median training day is \(format(a)) in the first half of the series and \(format(b)) in the second, a factor of \(Int((hi / lo).rounded())). A change of recording unit is far more likely than a change of that size in training",
                        dayIndices: [half]))
                }
            }

            let smallest = training.min()!, largest = training.max()!
            if smallest > 0, largest / smallest > 1e9 {
                findings.append(Finding(
                    check: .extremeDynamicRange, severity: .warning,
                    message: "training loads span a factor of \(String(format: "%.1e", largest / smallest)), which is wide enough for the rolling sums to lose precision",
                    dayIndices: []))
            }
        }

        let (longest, ends) = longestZeroRun(load)
        if longest >= breakDays, let ends {
            findings.append(Finding(
                check: .break, severity: .warning,
                message: "the longest run of zero-load days is \(longest) days. The ratio on the days after it is dominated by the break rather than by the training",
                dayIndices: [ends]))
        }

        // --- things to keep in mind when reading the output -----------------
        if nDays > 0 {
            let restFraction = 1.0 - Double(nTraining) / Double(nDays)
            if restFraction > 0.5 {
                findings.append(Finding(
                    check: .mostlyRest, severity: .note,
                    message: "\(Int((100 * restFraction).rounded()))% of days carry no load, so the chronic window is mostly zeros and the ratio will be volatile",
                    dayIndices: []))
            }
        }
        if nDays >= chronic {
            let usable = nDays - chronic + 1
            if usable < 30 {
                findings.append(Finding(
                    check: .fewUsableDays, severity: .note,
                    message: "only \(usable) day(s) will carry a ratio once the \(chronic) day warm-up is taken out",
                    dayIndices: []))
            }
        }
        if nTraining > 0, training.min()! == training.max()! {
            findings.append(Finding(
                check: .constantLoad, severity: .note,
                message: "every training day carries the same load, so the ratio is 1.0 wherever it is defined",
                dayIndices: []))
        }

        return LoadQuality(nDays: nDays, nTrainingDays: nTraining, findings: findings)
    }

    /// Length of the longest run of zero (or NaN) days and the index where
    /// it ends. Matches the reference: the first run of maximal length wins.
    static func longestZeroRun(_ load: [Double]) -> (Int, Int?) {
        var best = 0, run = 0
        var bestEnd: Int? = nil
        for (i, v) in load.enumerated() {
            if v.isNaN || v == 0 {
                run += 1
                if run > best { best = run; bestEnd = i }
            } else {
                run = 0
            }
        }
        return (best, bestEnd)
    }

    /// Four significant figures, trailing zeros trimmed (like Python's %.4g).
    static func format(_ x: Double) -> String {
        if x == x.rounded(), abs(x) < 1e6 { return String(Int(x)) }
        let s = String(format: "%.4g", x)
        return s
    }
}
