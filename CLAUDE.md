# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

RunGuard is an iOS app for running injury prevention. Users sync their runs from Garmin, Strava, or Apple Watch into Apple Health; RunGuard **reads from HealthKit only** — it never talks to Garmin/Strava APIs and never writes to HealthKit.

## Current Scope — do not exceed

The app currently does exactly three things:

1. Request HealthKit read authorization.
2. Query recent running workouts and show them as a simple list: date, distance, duration, average heart rate. The lookback window is the single constant `HealthKitService.fetchWindowDays` (default 90) — change it there, nowhere else.
3. Compute ACWR (acute:chronic workload ratio) in `ACWRService`: daily load = miles/day (rest days are explicit zeros), acute = 7-day rolling mean, chronic = 28-day rolling mean, ratio mapped to zones (<0.8 undertraining, 0.8–1.3 optimal, 1.3–1.5 caution, >1.5 high risk). Under 21 days of history → `lowConfidence`, no score. The math is a pure static function (`ACWRService.compute`) over `[RunningWorkout]` so it's testable without HealthKit; it is not wired into any UI yet.

Nothing else. No charts, no persistence, no settings, no networking. Do not add features, screens, or abstractions beyond this scope unless explicitly asked.

## Tech Constraints

- SwiftUI, iOS 17+ deployment target, MVVM.
- Views are dumb; HealthKit access lives in a service, exposed to views through an `@Observable` (or `ObservableObject`) view model.
- HealthKit only (`import HealthKit`). Read-only access: request read authorization for workouts and heart rate; never request share/write authorization.

## HealthKit Notes

- The HealthKit entitlement is already configured (`RunGuard/RunGuard.entitlements`, `com.apple.developer.healthkit`).
- The project uses a generated Info.plist (`GENERATE_INFOPLIST_FILE = YES`). HealthKit read access requires `NSHealthShareUsageDescription` — add it as an `INFOPLIST_KEY_NSHealthShareUsageDescription` build setting (or Info tab in Xcode) before any authorization request, or the app will crash at runtime.
- Query running workouts via `HKSampleQuery` on `HKObjectType.workoutType()` with a predicate combining `HKQuery.predicateForWorkouts(with: .running)` and a `HKQuery.predicateForSamples(withStart:end:)` window (see `HealthKitService.fetchWindowDays`).
- Distance and duration come from the `HKWorkout` itself; average heart rate requires a separate statistics query per workout over the workout's date interval (or `workout.statistics(for:)` on iOS 16+).
- HealthKit authorization status for read types is intentionally opaque (Apple privacy design): you cannot detect "denied" — a denied read just returns no data. Design UI copy accordingly (e.g., "No runs found — check Health app permissions") rather than trying to branch on authorization status.
- HealthKit does not work in the iOS Simulator without manually adding sample data via the Health app; real-device testing is required for realistic data.

**When writing any HealthKit code, explain it as you write it** — what each type, query, and predicate does and why — since HealthKit APIs are unfamiliar to the maintainer.

## Building

Open `RunGuard.xcodeproj` in Xcode, or from the CLI:

```sh
# Build for simulator
xcodebuild -project RunGuard.xcodeproj -scheme RunGuard \
  -destination 'platform=iOS Simulator,name=iPhone 16' build
```

There are no test targets or linters configured yet.

## Structure

Everything lives in `RunGuard/`: `RunGuardApp.swift` (entry point) and `ContentView.swift`. As MVVM files are added, keep the flat structure or group as `Views/`, `ViewModels/`, `Services/` — no deeper.
