# RunGuard demo video — script (target 2:50, hard stop 3:00)

Required by the rules, in this order: participant name, app name, purpose in
one sentence, target audience, tools and languages, functionality shown.
Judges stop watching at 3:00.

**Setup.** Shoot horizontal. No music. Open on Aditya on camera with the
iPhone in hand; everything after 0:20 is a screen recording of the real
device (Settings → Control Center → Screen Recording), with the app already
open to the run list so no time is spent on launch. Say "sample data" out
loud and point at the badge whenever the gait card is on screen.

Fill in: [grade], [school], [district].

---

**0:00–0:20 — on camera**

> I'm Aditya Garg, a [grade] at [school] in San Jose, California, [district].
> This is RunGuard. It tells high-school runners when their training load and
> their running mechanics say they're heading toward an injury, and it tells
> them how much to trust that score. It's a native iOS app in Swift, SwiftUI,
> SwiftData and HealthKit, and the statistics come from a Python package I
> published, ported into a tested Swift library. Everything runs on the
> phone; nothing leaves it.

**0:20–0:45 — screen: run list and the risk card**

> This is my own Garmin training, synced through Apple Health. The card at
> the top is the acute-to-chronic workload ratio: my last seven days divided
> by my last twenty-eight, with rest days counted as zeros, which is the
> detail most published versions get wrong. Every running app shows this
> number, and every one of them uses the same cutoff: 1.5, from a 2016 paper.

**0:45–1:15 — screen: tap "How this is computed" on Your Threshold**

> RunGuard 2.0 puts that cutoff next to the athlete it's being applied to.
> On my history, 1.5 flags [X]% of my days — it's my [Y]th percentile. My own
> 95th percentile is [Z]. Once there are sixty days of scores, the app colors
> the risk card with my percentiles instead of the universal number, and it
> says so right here. And it says the honest thing too: a cutoff picked from
> your own history flags a fixed share of your days by construction. It
> shows you how arbitrary 1.5 is. It doesn't claim to replace it.

**1:15–1:45 — screen: Self-Audit card, expand**

> In 2021 the sports-science field showed that this ratio mostly repeats your
> weekly mileage: swap the denominator for noise and the prediction barely
> changes. RunGuard runs that test on your own data. This is the rank
> correlation between my score and my last seven days alone, with a
> bootstrap interval: [ρ]. Above 0.9 the score is mostly repeating my
> mileage. This is the only running app that tells you whether its own score
> means anything.

**1:45–2:15 — screen: Gait card, switch on sample data, point at the badge**

> Load alone is yesterday's model. The app reads ground contact time and
> vertical oscillation from Apple Watch running dynamics in Health and flags
> mechanical drift against your own four-week baseline, if pace didn't
> change. My watch is a Garmin, which doesn't write those metrics to Health,
> so what you're seeing is the labelled sample dataset — right there, "sample
> data." The two-axis view puts load on one axis and gait on the other. The
> thresholds are heuristics, and the app says that too.

**2:15–2:35 — screen: Data Check card (or Settings → RunGuard 2.0 if no warnings)**

> Before any score renders, RunGuard checks the log it was given: too little
> history, a watch left running, a long break, a change of units. It tells
> you; it doesn't silently fix anything, because whether a gap was rest or a
> dead battery is your call, not the app's.

**2:35–2:52 — screen: Terminal or Xcode, green test run**

> Every statistic is checked against the Python reference. Sixty-nine tests:
> every ratio value, percentile and correlation matches to nine decimal
> places. The one place they didn't — rank correlation on days with ties —
> turned out to be floating-point tie-breaking in pandas, and the test now
> documents it.

**2:52–2:58 — on camera or title card**

> RunGuard. The injury score that tests itself.

---

## What's new in 2.0 (say this if a judge asks; also in the written answers)

Only the 2.0 work is highlighted for consideration: the `RunGuardCore`
library and its tests, the personal threshold, the self-audit, the gait
channel, and the data check. The 1.x base (HealthKit sync, ACWR card,
check-ins, soreness, settings) is shown as context.

## Recording checklist

- [ ] Phone charged, Do Not Disturb on, app open on the run list
- [ ] Settings → RunGuard 2.0 → Personal zones ON
- [ ] Gait card: sample-data switch OFF at first, flip it ON on camera
- [ ] Terminal: `cd RunGuardCore && swift test 2>&1 | tail -3` ready to run (takes ~1 min; pre-run and show the result)
- [ ] Read the real numbers off the phone into the script before recording: [X] [Y] [Z] [ρ]
- [ ] Upload to YouTube as unlisted or public; copy the link into the portal
