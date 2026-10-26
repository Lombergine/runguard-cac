//
//  PreviewData.swift
//  RunGuard
//
//  Simulator-only. The iOS Simulator's Health store is empty and cannot be
//  seeded from the command line, so this seam lets the home screen be
//  rendered and screenshotted with a realistic year of runs. It is wrapped
//  in `#if targetEnvironment(simulator)` and compiled into no device build,
//  activates only when the RUNGUARD_PREVIEW=1 environment variable is set,
//  and labels the screen "preview data". It is a development tool, not a
//  demo mode: the demo video is recorded on a real iPhone with real runs.
//
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

#if targetEnvironment(simulator)
import Foundation
import RunGuardCore

enum PreviewData {
    static var isActive: Bool {
        ProcessInfo.processInfo.environment["RUNGUARD_PREVIEW"] == "1"
    }

    /// Which card to scroll to after launch, so a screenshot can show it.
    static var scrollTarget: String? {
        ProcessInfo.processInfo.environment["RUNGUARD_PREVIEW_SCROLL"]
    }

    /// A year of plausible high-school training: five or six runs a week,
    /// Mondays off, a Sunday long run, a two-week break five months ago,
    /// and a ramp in the last ten days. Seeded, so it is the same every time.
    static func runs(asOf now: Date = .now, calendar: Calendar = .current) -> [RunningWorkout] {
        var rng = SplitMix64(seed: 7)
        func unit() -> Double { Double(rng.next() % 10_000) / 10_000 }
        let today = calendar.startOfDay(for: now)
        var runs: [RunningWorkout] = []
        for daysAgo in 0..<365 {
            let day = calendar.date(byAdding: .day, value: -daysAgo, to: today)!
            let weekday = calendar.component(.weekday, from: day)
            let roll = unit()
            if weekday == 2 { continue }                       // Monday rest
            if roll < 0.15 { continue }                        // the odd skipped day
            if (150...163).contains(daysAgo) { continue }      // two-week break
            var miles = 3.0 + unit() * 5.0
            if weekday == 1 { miles += 4.0 }                   // Sunday long run
            if daysAgo < 10 { miles *= 1.35 }                  // recent ramp
            let paceSeconds = 470.0 + unit() * 60.0            // ~7:50–8:50 /mi
            let start = day.addingTimeInterval(6.5 * 3600 + unit() * 3600)
            runs.append(RunningWorkout(
                id: UUID(uuidString: String(format: "0000000A-0000-4000-8000-%012d", daysAgo))!,
                date: start,
                distanceMiles: (miles * 100).rounded() / 100,
                duration: miles * paceSeconds,
                averageHeartRate: Int(148 + unit() * 16)
            ))
        }
        return runs.sorted { $0.date > $1.date }
    }
}
#endif
