# RunGuard demo video — script (target 2:50, hard stop 3:00)

Order the rules require: names, app name, purpose in one sentence, audience,
tools and languages, functionality shown. Judges stop at 3:00.

**Setup.** Horizontal. No music. Open on Aditya on camera with the iPhone.
Everything after 0:20 is a screen recording of the phone running the app
against the RunGuard server on the laptop. Say "sample data" out loud when the
gait panel is on screen. Only 2.0 is highlighted for consideration; the base
app is shown as context.

Fill in: [grade], [school], [district], and the numbers in brackets from the
phone on recording night.

---

**0:00–0:20, on camera**
> I'm Aditya Garg, a [grade] at [school] in San Jose, [district], and this is
> RunGuard, built with my teammate Pranav. Between a quarter and a third of
> high-school runners get hurt every season. [One sentence: your own injury,
> or a teammate's.] RunGuard reads a runner's training from Apple Health and
> tells them, and their coach, when the load says an injury is coming. Our
> team, Leland XC, uses it. Version 2.0, which this video is about, makes it
> the only running app that tells you how much to trust its own score. It's
> TypeScript end to end: a Next.js server, an Expo iOS app, and the
> statistics from a Python package I published.

**0:20–0:45, Home and Stats**
> This is the product: morning check-in, readiness, body scan, your runs from
> Apple Health. Here on Stats is the workload ratio, your last seven days
> against your last month. Every running app shows this number, and every one
> uses the same cutoff, 1.5, from a 2016 paper.

**0:45–1:15, Your threshold**
> 2.0 puts that cutoff next to the athlete it's applied to. On my history, 1.5
> flags 3.5% of my days, my 96th percentile. My own 95th percentile is 1.37,
> and it's drawn on the chart in violet next to the universal line. And it says
> the honest thing: a cutoff from your own history flags a fixed share of your
> days by construction. It shows how arbitrary 1.5 is. It doesn't claim to
> replace it.

**1:15–1:45, Self-audit**
> In 2021 the field showed the ratio mostly repeats your weekly mileage: swap
> the denominator for noise and the prediction barely changes. RunGuard runs
> that test on your own data. Rank correlation between my score and my last
> seven days alone, with a bootstrap interval: 0.83, between 0.77 and 0.89.
> Near 1 the score is just mileage in different units; at 0.83 most of mine
> is, and the four-week baseline adds a little. The app tells you which case
> you're in.

**1:45–2:15, Gait: tap "Check your gait with the camera", then the sample switch**
> And for everyone who doesn't own an Apple Watch, me included: film ten
> seconds from the side and the phone measures cadence, bounce and whether
> one foot stays down longer than the other, with Apple's own pose detector,
> on the device. The clip never leaves the phone. [Show a result if you
> recorded one before filming.]

**(fallback copy for the same scene, Apple Watch channel)**
> Load alone is yesterday's model. The gait channel reads ground contact time
> and vertical oscillation from Apple Watch running dynamics and flags
> mechanical drift against your own four-week baseline when pace didn't
> change. My watch is a Garmin, which doesn't write those, so this is the
> labelled sample set, right there: "sample data". The thresholds are
> heuristics, and the panel says so.

**2:05–2:20, Data check**
> Before any score, RunGuard checks the log it was given: too little history,
> a watch left running, a long break, a change of units. It tells you; it never
> silently fixes anything, because whether a gap was rest or a dead battery is
> your call.

**2:20–2:35, laptop, coach dashboard**
> The coach sees it for the whole team. Median self-audit across the squad,
> who the universal cutoff can never warn, and the 2021 paper's own experiment
> run on our injury log: does the score beat a ratio built on noise? With our
> injuries logged it answers; until then it says it can't. One engine, both
> screens.

**2:35–2:52, terminal, green tests**
> Every statistic is checked against the Python reference. Twenty-nine tests:
> every ratio value, percentile and correlation to nine decimal places. The one
> that didn't match, rank correlation on days with ties, turned out to be
> floating-point tie-breaking in pandas, and the test now documents it.

**2:52–2:58**
> RunGuard. The injury score that tests itself.

---

## Recording checklist
- [ ] Laptop: `cd website && npm run dev` running; `cd app && npx expo start` running; phone on the same Wi-Fi
- [ ] If the laptop changed networks since the last build: put the new address (`ipconfig getifaddr en0`) into `app/.env` as `EXPO_PUBLIC_API_URL=http://<ip>:3000`, restart Metro, and in the app's dev launcher pick the server at that address. Every screen says "couldn't be loaded" when this is stale
- [ ] Phone: RunGuard open and signed in; Stats tab reachable
- [ ] If demoing your own runs: Home → Connect Apple Health → sync, then pull to refresh Stats
- [ ] Terminal: `cd website && npm test` pre-run; show the summary line
- [ ] The numbers above are from the seeded account on Oct 26 (3.5% / 96th / 1.37 / ρ 0.83). If you sync your own Garmin runs before recording, re-read them off the Stats tab
- [ ] Upload to YouTube unlisted or public; link into the portal
