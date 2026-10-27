# RunGuard: Congressional App Challenge video script

Final cut. Target 2:50, hard limit 3:00. Two cameras: your phone screen
(screen recording) and your laptop screen (QuickTime or OBS), plus you on
camera for the open and close. Every line is something the screen can show.

Fill the three brackets from your own Stats tab before recording:
[GRADE], [SCHOOL], [X]% and [Y] from the "Your threshold" card.

---

**0:00 to 0:14. You on camera, phone in hand.**

> I'm Aditya Garg, a [GRADE] at [SCHOOL] in San Jose, and I run cross-country.
> This is RunGuard. It's the app our team uses for training, recovery, races
> and check-ins. And it does one thing no other running app does: it checks
> whether its own injury score is true for you.

**0:14 to 0:32. Phone: Stats tab, the workload chart with the 1.5 line.**

> Every running app shows this number. It's your last week of training
> divided by your last four weeks, with a warning line at 1.5. In 2021 a
> study of 5,205 runners found the formula mostly measures this week alone,
> and predicts injury no better than noise. Every app still ships it.

**0:32 to 0:50. Phone: scroll to "Your threshold".**

> So RunGuard puts the number next to the runner. For me, 1.5 flags [X] of
> my days. My own 95th percentile is [Y]. The chart draws my line, in violet,
> next to the borrowed one, and says which line is mine.

**0:50 to 1:08. Phone: "Self-audit", tap Details.**

> Then it runs the study's own test on my data. This is how much the score
> just repeats my last seven days, with a confidence interval. Below 0.7 the
> four-week baseline is doing real work. Above 0.9 it isn't, and the app says
> so in plain words. No other app tells you this.

**1:08 to 1:18. Phone: "Data check".**

> Before any of that it checks the log it was given: a watch left running, a
> long break, a change of units. It tells you. It never silently fixes
> anything.

**1:18 to 1:50. Phone: Gait card, "Check your gait with the camera",
choose your stride clip, wait for the result.**

> Load alone is yesterday. This is me, filmed from the side. Apple's
> body-pose model runs on the phone, nothing is uploaded, and RunGuard reads
> my cadence, how much I bounce, and how long each foot stays on the ground,
> left against right. Every clip is compared to my earlier ones, so a change
> shows up as a change, not a verdict.

**1:50 to 2:20. Laptop: coach dashboard, scrolled to "Can the score be
trusted on this team?" then "Learned from this team".**

> The coach sees the whole team. First, the 2021 paper's experiment rerun on
> our own injury log: the real score against a score whose baseline was
> replaced with noise. It refuses to run below ten injuries, because two
> events is a coin flip. Then a model trained on this team's own year, scored
> on each runner by a model that never saw them. Here it beats the universal
> formula by 0.04 with an interval that excludes zero, and it shows what it
> learned. These sample injuries are generated, and the panel says so.

**2:20 to 2:35. Phone: "Explain my numbers", tap Explain.**

> The AI layer only explains numbers the server computed. Every figure in its
> reply is checked against the input. If one doesn't match, the reply is
> thrown away and the app's own wording is used. The AI never generates the
> score.

**2:35 to 2:45. Laptop: terminal, `npm test`, green.**

> Every statistic is checked against the Python reference in 51 tests. The
> base app took a year. The features I just showed were added this month
> with an AI pair programmer, and the repo discloses exactly which files.

**2:45 to 2:52. You on camera.**

> RunGuard. Every other app shows you a number. This one tells you whether to
> believe it.

---

## Shot list, in recording order

| # | Screen | What to capture | Where it goes |
|---|---|---|---|
| 1 | You | Intro and outro, one take each, phone in hand | 0:00, 2:45 |
| 2 | Phone | Stats tab from the top: chart, then slow scroll through the four panels | 0:14 to 1:18 |
| 3 | Phone | Gait card, camera check, Choose from library, pick the stride clip, result | 1:18 |
| 4 | Laptop | Demo coach link, dashboard, scroll to the two team panels | 1:50 |
| 5 | Phone | Explain my numbers, tap Explain, reply appears | 2:20 |
| 6 | Laptop | `cd website && npm test` in a terminal, wait for green | 2:35 |

## Before recording

- Phone on home Wi-Fi, Metro and the web server running on the Mac.
- Swipe away the yellow "Open debugger" bar on the phone once. It is a dev
  notice, not the app.
- Tap Explain once before recording so the reply is cached and appears fast.
- Laptop: open http://localhost:3000/api/demo/coach, then /dashboard. Hide
  bookmarks bar; zoom the browser to 110% so text reads on video.
- Terminal: font size 18 or more, run the test once beforehand so the second
  run is fast.
- The stride clip: side view, whole body in frame, ten seconds or more.

## Rules the judges will check against

- Under three minutes. This cut is 2:52 at a normal speaking pace.
- The app is shown working, not slides. Every scene is a live screen.
- Say "sample data" wherever it is sample data. The script does, twice.
- Say what the AI did. The script does, and DISCLOSURE.md backs it up.
