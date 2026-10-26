# The quiz — explain each piece without notes before recording

Judges can request the source and ask questions. Before the video, go
through these cold. Model answers follow each question; yours should be in
your own words and shorter.

## A. The ratio itself

**Q. What is the acute:chronic workload ratio in one sentence?**
Mean daily load over the last 7 days divided by mean daily load over the
last 28, both including today.

**Q. Why must rest days be zeros and not missing?**
A rolling 28-day window over only the days you trained isn't a 28-day
window. A week off genuinely lowers your acute load; skipping it would hide
that.

**Q. Why is "coupled" a problem?**
The 7-day window sits inside the 28-day window, so today's hard run is in
both the numerator and the denominator. That pulls the ratio toward 1 and
caps it at 4.0 at 7/28: a reading of 4.0 means every mile of the month was
run this week, not "four times normal."

**Q. What does the app do for the first 27 days?**
The reference methods report NaN: no partial windows. The product's own
EWMA series seeds on day one and withholds a ratio until the chronic load is
above 25, and the audit runs on that series, the one you are shown.

## B. Personal threshold

**Q. What does "1.5 flags 2% of your days, your 98th percentile" mean?**
Of all my days that carry a ratio, 2% are above 1.5. So on my history 1.5
is the 98th percentile: it fires on my hardest 2% of days.

**Q. Where does the app's personal threshold come from?**
The 95th percentile of my own finite ratios, computed with numpy-style
linear interpolation, with my 90th as the caution line. They're reported
and drawn on the chart once 60 days carry a ratio; the athlete screens
never colour a verdict by them, because this app deliberately doesn't rank
the athlete.

**Q. Why is a personal threshold also arbitrary?**
Because it flags a fixed share of my days by construction: 5% of them,
whatever my training was. It exposes the arbitrariness of 1.5; it doesn't
replace it with something validated. The app says so on the card.

**Q. How are infinite ratios handled?**
They happen only with uncoupled or EWMA methods when the chronic window is
zero. They count as flagged, and they're excluded from the percentiles,
otherwise every percentile above the first infinity would be meaningless.

## C. Self-audit

**Q. What is the rescaling check testing?**
How closely the ratio tracks its own numerator. Spearman rank correlation
between the acute load and the ratio, day by day. Near 1.0 means dividing by
the chronic load barely reordered the days: the score is my weekly mileage
in different units.

**Q. Why Spearman rather than Pearson?**
Rank correlation asks whether the *ordering* of days survives the division.
That's the question: does the denominator change which days look worst?

**Q. Where does the confidence interval come from?**
Percentile bootstrap: resample the (acute, ratio) pairs with replacement 500
times on the server (2000 in the Python package), recompute Spearman each
time, take the 2.5th and 97.5th percentiles. Seeded, so it's the same every
time.

**Q. What's the limiting case?**
A constant denominator. Divide by a constant and Spearman is exactly 1.0.
There's a test for it.

**Q. What did Impellizzeri et al. actually show in 2021?**
They replaced the chronic denominator with shuffled, random, or constant
values and the ratio predicted injury about as well. If noise does the
denominator's job, the denominator wasn't doing one.

## D. Gait channel

**Q. What two metrics, and from where?**
Ground contact time (ms) and vertical oscillation (cm), per-run quantity
samples that Apple Watch writes to HealthKit on outdoor runs (watchOS 9+).
The app averages the samples inside each workout's time span.

**Q. What's the baseline and why is it uncoupled?**
Median of per-run means over the 28 days *before* the recent 7-day window,
minimum four runs. If the baseline included this week, a drifting week would
pull its own baseline toward itself, the same coupling problem as the ratio.

**Q. When does it flag?**
Contact time up more than 5% or oscillation up more than 8%, and pace not
more than 2% faster. A faster week changes mechanics on its own.

**Q. Are those thresholds validated?**
No. They're heuristics I chose, labelled as heuristics on the card and in
the answers. The 2026 literature says temporal gait parameters carry signal;
it doesn't give these cut points.

**Q. Why is my demo on sample data?**
My watch is a Garmin, which syncs distance and heart rate to Health but not
running dynamics. The code path is real and tested; the sample is six
generated weeks with a contact-time rise of about 7% at unchanged pace, and it's
labelled on screen.

## E. Data check

**Q. Name the checks.**
Errors: history shorter than 28 days, no training at all, negative loads.
Warnings: outlier days (over 3× the 95th-percentile training day, the
watch-left-running case), breaks of 10+ zero days, a suspected unit change
(median of one half of the log vs. the other differs by more than 50×),
unobserved days. Notes: mostly rest, few usable days, constant load.

**Q. Why compare outliers to the 95th percentile and not the median?**
Training load is right-skewed. A long run is five times a typical day and
isn't an error. Against the median, every athlete's longest run would be
flagged and the check would be ignored within a week.

## F. The verification story (technical difficulty)

**Q. How do you know the TypeScript port is right?**
A Python script runs my `acwr` package on three seeded series and dumps
every intermediate value to JSON. Twenty-nine vitest cases load that file and
assert the TypeScript values match to 1e-9, including the NaN warm-up and the
infinities. A Swift port built the same night passes the same fixture.

**Q. What didn't match at first, and why?**
Spearman, in the seventh decimal, only on series with rest days. Consecutive
7-day windows that hold the same single run are mathematically tied. pandas
forms its rolling mean with a running add/subtract sum, so the ties came out
a few bits apart and got different ranks; our code sums each window directly
and ties them exactly. Rounding the Python arrays to 9 decimals restored the
ties and the values agreed exactly. Our answer was the correct one.

## G. Design

**Q. Why is the audit computed on the server and not the phone?**
The coach dashboard and the athlete app must show the same number, so the
scoring engine lives in one place, `website/src/lib`. Five hundred resamples
of a year-long series take about 100 ms there. The gait channel is the
exception: it reads Health samples that never leave the phone.

**Q. Does any 2.0 feature call an AI model at runtime?**
No. Every 2.0 number is computed by TypeScript from the athlete's own data.
The athlete chat predates 2.0 and is part of the base product. An
explanation layer is in the roadmap, with the constraint that the model may
explain numbers but never generate them.
