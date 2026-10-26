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
> RunGuard, built with my teammate Pranav. It watches a high-school runner's
> training load and tells them, and their coach, when the numbers say an injury
> is coming. Version 2.0, which is what this video is about, is the only
> running app that tells you how much to trust that score. TypeScript end to
> end: a Next.js server and an Expo iOS app reading Apple Health, with the
> statistics from a Python package I published.

**0:20–0:45, Home and Stats**
> This is the product: morning check-in, readiness, body scan, your runs from
> Apple Health. Here on Stats is the workload ratio, your last seven days
> against your last month. Every running app shows this number, and every one
> uses the same cutoff, 1.5, from a 2016 paper.

**0:45–1:15, Your threshold**
> 2.0 puts that cutoff next to the athlete it's applied to. On my history, 1.5
> flags [X]% of my days, my [Y]th percentile. My own 95th percentile is [Z],
> and it's drawn on the chart in violet next to the universal line. And it says
> the honest thing: a cutoff from your own history flags a fixed share of your
> days by construction. It shows how arbitrary 1.5 is. It doesn't claim to
> replace it.

**1:15–1:45, Self-audit**
> In 2021 the field showed the ratio mostly repeats your weekly mileage: swap
> the denominator for noise and the prediction barely changes. RunGuard runs
> that test on your own data. Rank correlation between my score and my last
> seven days alone, with a bootstrap interval: [ρ]. Near 1 the score is just
> mileage in different units; mine is [ρ] because [rest days / smooth
> training]. The app tells you which case you're in.

**1:45–2:15, Gait, sample switch on, point at the badge**
> Load alone is yesterday's model. The gait channel reads ground contact time
> and vertical oscillation from Apple Watch running dynamics and flags
> mechanical drift against your own four-week baseline when pace didn't
> change. My watch is a Garmin, which doesn't write those, so this is the
> labelled sample set, right there: "sample data". The thresholds are
> heuristics, and the panel says so.

**2:15–2:35, Data check**
> Before any score, RunGuard checks the log it was given: too little history,
> a watch left running, a long break, a change of units. It tells you; it never
> silently fixes anything, because whether a gap was rest or a dead battery is
> your call.

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
- [ ] Phone: RunGuard open and signed in; Stats tab reachable
- [ ] If demoing your own runs: Home → Connect Apple Health → sync, then pull to refresh Stats
- [ ] Terminal: `cd website && npm test` pre-run; show the summary line
- [ ] Read [X] [Y] [Z] [ρ] off the phone into the script
- [ ] Upload to YouTube unlisted or public; link into the portal
