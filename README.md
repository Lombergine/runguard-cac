# RunGuard (Swift cross-check)

> **Not the competition entry.** The Congressional App Challenge 2026 entry is the
> RunGuard product (Expo app + Next.js server) at
> github.com/runguard663-ui/frREALRUNGUARDfr, branch `cac-2.0`. This repository is a
> native Swift implementation of the same 2.0 statistics, built the same night and
> tested against the same Python fixture, kept as an independent cross-check.

**The injury score that tests itself.**

RunGuard is a native iOS app for high-school distance runners. It reads
running workouts from Apple Health (any watch that syncs there: Apple Watch,
Garmin, Strava), computes the acute:chronic workload ratio with rest days as
explicit zeros, and tells the runner when their training load says they are
heading toward an injury.

RunGuard 2.0 (Congressional App Challenge 2026) adds the parts no running
app has:

- **A personal threshold.** Every app applies 1.5 to everyone. RunGuard
  reports what 1.5 picks out of *your* history and learns your own 95th
  percentile once you have 60 days of scores.
- **A self-audit.** The 2021 sports-science literature showed the ratio
  mostly repeats your weekly mileage. RunGuard runs that test on your data
  and tells you how much its own score is worth.
- **A gait channel.** Ground contact time and vertical oscillation from
  Apple Watch running dynamics, drifted against your four-week baseline, as
  a second risk axis independent of load.
- **A data check** before any score renders: short history, outlier days,
  long breaks, unit changes.

Everything is computed on the phone. Nothing leaves the device. There is no
account, no server, and no API key.

## Layout

```
RunGuard.xcodeproj         the iOS app
RunGuard/                  SwiftUI app sources (iOS 17+)
RunGuardCore/              the statistics as a Swift package, no dependencies
  Sources/RunGuardCore/    ACWR methods, diagnostics, quality checks, gait model
  Tests/RunGuardCoreTests/ 69 tests, checked against the Python reference
    Fixtures/              acwr_reference.json + the script that generated it
DISCLOSURE.md              exactly what was AI-assisted, and what was not
docs/                      video script, written answers, quiz
```

## Build and run

Open `RunGuard.xcodeproj` in Xcode 26 and run on an iPhone (HealthKit has
no data in the simulator). Or from the command line:

```sh
xcodebuild -project RunGuard.xcodeproj -target RunGuard -sdk iphonesimulator build
```

## Run the tests

```sh
cd RunGuardCore && swift test
```

The suite compares the Swift output against numbers produced by the Python
package [`acwr`](https://github.com/Lombergine/acwr) on three seeded series:
every ratio value (including warm-up and infinities), percentiles, Pearson
and Spearman, to nine decimal places. Regenerate the reference with:

```sh
cd /path/to/acwr && uv run --with-editable . --with scipy \
  python /path/to/RunGuardCore/Tests/RunGuardCoreTests/Fixtures/generate_reference.py out.json
```

## Science, stated honestly

The acute:chronic workload ratio is a monitoring signal, not a validated
predictor of injury; Impellizzeri et al. (2021) argue the field should
dismiss it. RunGuard shows the number because every runner is already
looking at it somewhere, and then shows them how much of it is just their
last seven days. The personal threshold flags a fixed share of your days by
construction. The gait thresholds are heuristics. None of this is medical
advice.

## Authorship

See [`DISCLOSURE.md`](DISCLOSURE.md).
