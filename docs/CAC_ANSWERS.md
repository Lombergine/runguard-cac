# Congressional App Challenge 2026 — written answers (drafts)

One short paragraph each. Fill the bracketed personal details; do not invent
them. Numbers in brackets come from the phone on recording night.

## 1. App title

RunGuard

## 2. What does your app do? (purpose)

RunGuard is a native iOS app that gives high-school distance runners an
honest injury early-warning. It reads their runs from Apple Health, computes
the acute:chronic workload ratio correctly (rest days as zeros), and then
does three things no running app does: it learns a personal threshold from
the athlete's own history instead of applying the universal 1.5 cutoff to
everyone; it audits its own score, reporting how much of the number is just
the last seven days of mileage (the Impellizzeri 2021 critique, run on the
runner's own data); and it adds a second, load-independent risk channel from
Apple Watch gait mechanics — ground contact time and vertical oscillation
drifting against a four-week baseline. A data check runs before any score
renders. Everything is computed on the phone; nothing leaves the device.

## 3. What inspired you to create this app?

> [Aditya: your own words. Suggested shape, replace with what is true.]
> I run [event] for [school]. [Teammate or own injury story, one sentence.]
> I built the first RunGuard around the ratio every running app shows, then
> read the 2021 paper that said the field should dismiss it, and realized the
> number on my own screen had been rejected by the people who study it. I
> published a Python package (`acwr`) to compute the ratio and the test its
> critics proposed, and RunGuard 2.0 is that test running on a phone, next
> to the score, where a runner will actually see it.

## 4. What technical difficulties did you face, and how did you overcome them?

The hardest problem was proving the Swift statistics matched the Python
reference. I ported the ratio, percentiles and correlations into a Swift
package and wrote tests that compare every value against numbers generated
by my Python package on three seeded training histories. Everything matched
to nine decimal places except one: the Spearman rank correlation in the
self-audit was off in the seventh decimal, but only on histories with rest
days. The cause was ties. When a runner rests six days in a row, seven
consecutive 7-day windows contain the same single run and are mathematically
equal, and rank correlation is discontinuous at ties. pandas computes its
rolling mean with a running add-and-subtract sum, so those equal windows
came out a few bits apart and received distinct ranks; my Swift code summed
each window directly and got exact ties with averaged ranks. Rounding the
Python arrays to nine decimals restored the ties, and the two implementations
then agreed exactly. The fix was not to change the code but to understand
which answer was right — the Swift one — and to make the test assert both
the exact value and the documented tolerance against raw pandas.

## 5. What is your biggest takeaway from building this app?

> [Aditya: your words. The point we want to land:]
> The honest version of a feature is more convincing than the confident
> one. Showing the audit, saying "heuristic" on the gait thresholds, and
> putting "sample data" on the screen in orange felt like weakening the app
> while I was doing it. It is the strongest thing in it.

## 6. If you had more time, what would you add? (2.0 roadmap)

Phone-camera gait analysis with Vision pose estimation so the gait channel
works without an Apple Watch; HRV and sleep from Health as a readiness
channel; a labelled injury dataset from coach feedback so the package's
`compare_to_null` test can report a real AUC against a null model; and the
grounded explanation layer that was scoped and then cut tonight, where a
language model explains the computed numbers under a strict schema and is
never allowed to generate them.

## Tools and languages (for the form)

Swift, SwiftUI, SwiftData, HealthKit, XCTest, Swift Package Manager, Xcode
26. Python 3.12 with numpy, pandas and scipy to generate the test reference
(not shipped). Claude Code as an AI pair programmer, fully disclosed in
DISCLOSURE.md.

## Team

Aditya Garg. [District: CA-__, Rep. ______.] Pranav worked on a separate
coach-platform repository that is not part of this submission.
