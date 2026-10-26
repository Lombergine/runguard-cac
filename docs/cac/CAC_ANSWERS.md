# Congressional App Challenge 2026 — written answers (drafts)

One short paragraph each. Fill the bracketed personal details; do not invent them.

## 1. Title
RunGuard

## 2. Purpose
Between 28 and 38 percent of high-school runners are injured every season.
RunGuard is an injury early-warning system for those runners and their
coaches, built for and used by our own team. The iOS app syncs each athlete's runs from Apple Health, a
server computes training load, the acute:chronic workload ratio, readiness and
recovery, and coaches see the whole roster before practice. Version 2.0 adds
what no running app has: it learns a personal threshold from the athlete's own
history instead of applying the universal 1.5 cutoff to everyone; it audits its
own score, reporting how much of the number is just the last seven days of
mileage (the Impellizzeri 2021 critique, run on the runner's own data); it
checks the training log before scoring it; and it adds a second,
load-independent risk channel from Apple Watch gait mechanics.

## 3. Inspiration
> [Aditya and Pranav: your words. Shape to replace:] We run [event] for
> [school]. [Injury story, one sentence.] We built the first RunGuard around the
> ratio every running app shows, then read the 2021 paper that said the field
> should dismiss it, and realized the number on our own screen had been rejected
> by the people who study it. Aditya published a Python package, `acwr`, that
> computes the ratio and the test its critics proposed; RunGuard 2.0 is that
> test running next to the score, where a runner will actually see it.

## 4. Technical difficulty
The hardest problem was proving the TypeScript statistics matched the Python
reference. A script runs the `acwr` package on three seeded training histories
and writes every intermediate value to a fixture; 25 tests assert the
TypeScript port matches, including the warm-up blanks and the infinities.
Everything agreed to nine decimal places except one: the Spearman rank
correlation in the self-audit was off in the seventh decimal, only on histories
with rest days. The cause was ties. When a runner rests six days in a row,
seven consecutive 7-day windows contain the same single run and are
mathematically equal, and rank correlation is discontinuous at ties. pandas
builds its rolling mean with a running add-and-subtract sum, so those equal
windows came out a few bits apart and got distinct ranks; our code sums each
window directly and ties them exactly. Rounding the Python arrays to nine
decimals restored the ties and the two agreed to every digit. The fix was not
to change the code but to work out which answer was right, ours, and to make
the test assert both the exact value and the documented tolerance.

## 5. Biggest takeaway
> [Your words. The point:] The honest version of a feature is more convincing
> than the confident one. Showing the audit, labelling the gait thresholds as
> heuristics, and putting "sample data" on screen in orange felt like weakening
> the app. It is the strongest thing in it.

## 6. If you had more time
Phone-camera gait analysis with Vision pose estimation so the gait channel
works without an Apple Watch; HRV and sleep as a readiness channel in the
audit; a labelled injury dataset from coach feedback so the package's
`compare_to_null` test can report a real AUC; and a grounded explanation layer
where a language model explains the computed numbers under a strict schema and
is never allowed to generate them.

## Tools and languages (for the form)
TypeScript throughout: Next.js 16 and React on the server (SQLite locally,
Postgres deployed), Expo / React Native for the iOS app with
`@kingstinct/react-native-healthkit` for Apple Health, react-native-svg for the
charts, vitest for tests. Python 3.12 with numpy, pandas and scipy to generate
the test reference (not shipped). Claude Code as an AI pair programmer, fully
disclosed in DISCLOSURE.md.

## Team
Aditya Garg and Pranav [surname]. [District: CA-__, Rep. ______.]
