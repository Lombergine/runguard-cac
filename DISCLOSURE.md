# Disclosure of AI use — RunGuard, Congressional App Challenge 2026

This file states exactly what was written by whom. The CAC rules permit AI
tools "to support specific aspects of the project" provided all use is fully
disclosed and the student can demonstrate technical understanding. We would
rather over-disclose than leave a judge guessing.

## 1. The RunGuard base app (July–August 2026)

The RunGuard 1.x app — SwiftUI architecture, the HealthKit integration
(`HealthKitService.swift`), the original ACWR implementation
(`ACWRService.swift`: daily load with rest days as explicit zeros, 7/28-day
rolling means, zones, cold-start guard), the per-run check-ins
(`RunCheckIn.swift`, `RunCheckInView.swift`, SwiftData), recurring-soreness
detection (`SorenessService.swift`, `SorenessCard.swift`), and Settings
(`RunGuardSettings.swift`, `SettingsView.swift`) — was developed by Aditya
Garg between July 12 and August 30, 2026.

The repository contains a `CLAUDE.md` from that period, which means Claude
Code was used as a coding assistant during base development as well.

> **[Aditya, fill this in before submitting — do not leave it blank or vague.]**
> State which parts of 1.x you wrote by hand, which you wrote with AI
> assistance, and what the assistant did (e.g. "explained HealthKit queries
> as I wrote them", "drafted the soreness detector which I then rewrote").

A teammate, Pranav, worked on a separate RunGuard coach-platform repository
(React Native and Next.js). That code is **not** part of this submission and
is not in this repository.

## 2. The statistics: Aditya's Python package `acwr`

The ratio methods, the self-audit, the personal threshold, and the
data-quality checks are ports of Aditya's published Python package
[`acwr`](https://github.com/Lombergine/acwr) (`pip install acwr`,
ORCID 0009-0003-1004-500X). That package carries its own `AI-USAGE.md`,
which states that Claude wrote the large majority of its source and tests as
a pair programmer, under Aditya's direction, scope, domain knowledge, and
real training data (1,018 of his own runs over three years), and that Aditya
reviewed, questioned, and takes responsibility for every claim in it. That
disclosure applies to everything ported from it here.

## 3. RunGuard 2.0 features (evening of October 25–26, 2026)

Everything on the `cac-2.0` branch after the commit "Baseline before RunGuard
2.0" was written in a single overnight session with **Claude Code (Claude
Fable 5.1)** as an AI pair programmer, directed by Aditya. Every new or
modified file carries the header `Added for RunGuard 2.0 (CAC 2026),
AI-assisted, see DISCLOSURE.md`. Specifically:

**Files Claude Code wrote the majority of (new files):**

| File | What it is |
|---|---|
| `RunGuardCore/Package.swift` | Swift package manifest |
| `RunGuardCore/Sources/RunGuardCore/ACWR.swift` | The three ratio methods (port of `acwr.ratio`) |
| `RunGuardCore/Sources/RunGuardCore/Diagnostics.swift` | Self-audit and personal threshold (port of `acwr.diagnostics`) |
| `RunGuardCore/Sources/RunGuardCore/Quality.swift` | Data-quality pre-flight (port of `acwr.quality`) |
| `RunGuardCore/Sources/RunGuardCore/DailySeries.swift` | Continuous daily series (port of `acwr.load`) |
| `RunGuardCore/Sources/RunGuardCore/Statistics.swift` | Mean, SD, numpy-style percentile, scipy-style ranks, Pearson, Spearman |
| `RunGuardCore/Sources/RunGuardCore/SeededGenerator.swift` | SplitMix64, a seedable RNG for the bootstrap |
| `RunGuardCore/Sources/RunGuardCore/Gait.swift` | Gait drift heuristic and the labelled sample dataset |
| `RunGuardCore/Tests/RunGuardCoreTests/*.swift` | 69 XCTest cases, ported from the Python test suite |
| `RunGuardCore/Tests/RunGuardCoreTests/Fixtures/generate_reference.py` | Script that produces the Python reference numbers |
| `RunGuardCore/Tests/RunGuardCoreTests/Fixtures/acwr_reference.json` | Those numbers (generated, not hand-written) |
| `RunGuard/GaitHealthKit.swift` | HealthKit running-dynamics queries per workout |
| `RunGuard/InsightsService.swift` | Adapts the app's series to RunGuardCore, decides which zones are in use |
| `RunGuard/InsightCards.swift` | The four cards and the load-vs-drift quadrant view |
| `DISCLOSURE.md`, `README.md`, `docs/*.md` | This file and the submission documents |

**Existing files Claude Code modified (small, listed changes):**

| File | Change |
|---|---|
| `RunGuard.xcodeproj/project.pbxproj` | Links the local `RunGuardCore` package |
| `RunGuard/HealthKitService.swift` | Five running-dynamics read types added (still read-only); lookback window 90 → 365 days; `store` made internal for the gait extension |
| `RunGuard/WorkoutListViewModel.swift` | Loads insights and gait after the run fetch; applies personal zones |
| `RunGuard/RunGuardSettings.swift`, `RunGuard/SettingsView.swift` | "Personal zones from my history" toggle |
| `RunGuard/ContentView.swift` | Inserts the four cards under the risk card |
| `CLAUDE.md` | Scope section updated |

**What Aditya did tonight:** chose which features to build and in what order,
chose the Swift app over the React Native repo as the entry, supplied the
`acwr` package and its tests as the reference to port, decided the gait
channel would demo on labelled sample data because his Garmin does not write
running dynamics to Health, built and ran the app on his iPhone, ran the test
suite, and was quizzed on every core piece until he could explain it without
notes (see `docs/QUIZ.md`). He reviewed every file before it was committed.

**What Aditya did not do tonight:** type most of the code. We are stating
that plainly because the rules ask for it.

## 4. Runtime AI: none

RunGuard 2.0 makes **no network calls**. Every statistic is computed on the
phone from HealthKit data, and nothing leaves the device. A planned
"grounded explanation" feature that would have called the Anthropic API from
a server was **not built**, because it would have broken that property and
there was no server for this app to call. The app contains no API keys.

## 5. Open-source and third-party components

- Apple frameworks only at runtime: SwiftUI, SwiftData, HealthKit,
  Foundation, XCTest (tests). No third-party Swift dependencies.
- Python, used only to generate the test reference numbers, not shipped:
  [`acwr`](https://github.com/Lombergine/acwr) (MIT, Aditya's), numpy, pandas,
  scipy (BSD).
- The rolling-coupled algorithm was cross-checked in the `acwr` package
  against the R package Athlytics (rOpenSci); that comparison is inherited.

## 6. References cited in the app and the submission

- Impellizzeri, F. M., Woodcock, S., Coutts, A. J., Fanchini, M., McCall, A.,
  & Vigotsky, A. D. (2021). What role do chronic workloads play in the acute
  to chronic workload ratio? Time to dismiss ACWR and its underlying theory.
  *Sports Medicine*, 51(3), 581–592.
- Impellizzeri, F. M., Tenan, M. S., Kempton, T., Novak, A., & Coutts, A. J.
  (2020). Acute:chronic workload ratio: conceptual issues and fundamental
  pitfalls. *IJSPP*, 15(6), 907–913.
- Williams, S., West, S., Cross, M. J., & Stokes, K. A. (2017). Better way
  to determine the acute:chronic workload ratio? *BJSM*, 51(3), 209–210.
- Gabbett, T. J. (2016). The training–injury prevention paradox. *BJSM*,
  50(5), 273–280.
- Foster, C. (1998). Monitoring training in athletes with reference to
  overtraining syndrome. *Med Sci Sports Exerc*, 30(7), 1164–1168.
- Apple HealthKit: `HKQuantityTypeIdentifier.runningGroundContactTime`,
  `.runningVerticalOscillation`, `.runningStrideLength`, `.runningPower`,
  `.runningSpeed` (iOS 16+, watchOS 9+).
