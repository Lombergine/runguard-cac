/**
 * RunGuard AI knowledge base — the sports-science literature, distilled.
 *
 * Every entry is a real, load-bearing finding from the peer-reviewed running /
 * sport-science literature, with the citation attached. This is what makes RunGuard
 * different from a generic chatbot: its coaching claims trace to studies, and it
 * grounds them in the individual athlete's data.
 *
 * Nothing here is medical diagnosis. Red-flag guidance always routes a minor to
 * a coach / athletic trainer / clinician.
 */

export type Citation = { key: string; ref: string };

export const CITATIONS: Record<string, Citation> = {
  milewski2014: { key: "milewski2014", ref: "Milewski et al., 2014, J Pediatr Orthop, adolescent athletes sleeping <8h/night had ~1.7× the injury risk; each extra hour of sleep lowered risk." },
  mah2011: { key: "mah2011", ref: "Mah et al., 2011, SLEEP. Extending sleep to ~10h improved sprint times, reaction time, and mood in collegiate athletes." },
  gabbett2016: { key: "gabbett2016", ref: "Gabbett, 2016, Br J Sports Med, the 'training-injury prevention paradox': high chronic load is protective; it's the SPIKE (acute:chronic >1.5) that injures." },
  hulin2016: { key: "hulin2016", ref: "Hulin et al., 2016, Br J Sports Med. ACWR >1.5 associated with sharply elevated injury risk the following week." },
  malone2017: { key: "malone2017", ref: "Malone et al., 2017. Well-developed aerobic fitness and high chronic loads protect against spikes; fit athletes tolerate load better." },
  seiler2010: { key: "seiler2010", ref: "Seiler, 2010, Int J Sports Physiol Perform. Elite endurance athletes train ~80% easy / 20% hard (polarized); this distribution outperforms threshold-heavy training." },
  stoggl2014: { key: "stoggl2014", ref: "Stöggl & Sperlich, 2014, Front Physiol. Polarized training produced the largest gains in VO2max and performance vs threshold/HIT-only in trained endurance athletes." },
  daniels: { key: "daniels", ref: "Daniels, Daniels' Running Formula: VDOT system; race times predict training paces and equivalent performances across distances." },
  riegel: { key: "riegel", ref: "Riegel, 1981: endurance time scales with distance^1.06; the basis for race-time prediction across distances." },
  buchheit2014: { key: "buchheit2014", ref: "Plews & Buchheit, 2013–2017. HRV should be read as a 7-day rolling average vs the athlete's own baseline, not day-to-day; suppressed weekly HRV signals incomplete recovery." },
  vesterinen2016: { key: "vesterinen2016", ref: "Vesterinen et al., 2016, Scand J Med Sci Sports. HRV-guided training matched or beat pre-planned training for 3k/5k improvement with fewer hard sessions." },
  meeusen2013: { key: "meeusen2013", ref: "Meeusen et al., 2013, ECSS/ACSM consensus. Overtraining/non-functional overreaching: performance decline + persistent fatigue; early signs include rising resting HR, mood disturbance, and stalled times." },
  mountjoy2018: { key: "mountjoy2018", ref: "Mountjoy et al., 2014/2018/2023, IOC consensus on RED-S. Low energy availability impairs bone health, hormones, and performance; a leading cause of bone stress injuries in runners." },
  tenforde2013: { key: "tenforde2013", ref: "Tenforde et al., 2013. Bone stress injuries in adolescent/collegiate runners linked to low energy availability, menstrual dysfunction, and low bone density (Triad/RED-S)." },
  nieman1994: { key: "nieman1994", ref: "Nieman, 1994: the 'J-curve': moderate training lowers infection risk, very high loads transiently raise upper-respiratory infection risk." },
  casa2000: { key: "casa2000", ref: "Casa et al. / ACSM. Performance declines measurably around ~2% body-mass fluid loss; but overdrinking risks hyponatremia. Drink to thirst plus a plan for heat." },
  bishop2008: { key: "bishop2008", ref: "Mujika & Padilla; Bosquet et al., 2007 meta-analysis. A ~2-week taper reducing volume ~40–60% while keeping intensity yields ~2–3% performance gain." },
  nedergaard: { key: "nedergaard", ref: "Youth strength-training consensus (Lloyd/Faigenbaum et al.), supervised resistance & plyometric training is safe and improves performance and injury resilience in adolescents." },
  ramskov2018: { key: "ramskov2018", ref: "Nielsen/Ramskov running-injury work: sudden increases in weekly distance (esp. >~30%) raise overuse-injury risk; progress gradually." },
  aasm2016: { key: "aasm2016", ref: "AASM/AAP: teenagers need 8–10 hours of sleep per night for health and recovery." },
};

/** Compact one-liners the coach engine can drop into answers. */
export const FACTS = {
  sleepInjury: "sleeping under 8h a night is tied to roughly 1.7× the injury risk in teenage athletes (Milewski 2014), and each extra hour lowers it",
  sleepTeen: "teens need 8–10h of sleep (AASM), more than adults, because you're still growing AND training",
  sleepPerf: "banking sleep measurably improves sprint speed and reaction time (Mah, Stanford)",
  acwrSpike: "it's not high mileage that hurts you, it's the SPIKE; chronic fitness is protective, and load jumps past ~1.5× your recent average are what injure (Gabbett 2016, Hulin 2016)",
  fitProtects: "the fitter your aerobic base, the more load you can absorb safely. Fitness is armor (Malone 2017)",
  polarized: "elite runners train ~80% easy / 20% hard, and that split beats grinding everything at medium effort (Seiler; Stöggl 2014)",
  hrvRead: "HRV only means something as a multi-day trend against your own baseline. One low morning is noise (Plews & Buchheit)",
  hrvGuided: "letting recovery data guide when you go hard matches or beats a fixed plan, with fewer hard days (Vesterinen 2016)",
  overtraining: "the early signs of overtraining are a rising resting HR, flat mood, and times that stall despite working harder (Meeusen 2013 consensus)",
  redsBone: "under-fueling is a leading cause of stress fractures in runners, you can't build bone you don't feed (IOC RED-S consensus, Mountjoy)",
  jcurve: "moderate training strengthens immunity, but very hard blocks briefly open a window for colds. Extra sleep and food during peak weeks (Nieman J-curve)",
  hydration: "performance drops around 2% dehydration, but chugging water can be dangerous too. Drink to thirst, add electrolytes in heat (ACSM/Casa)",
  taper: "a proper 2-week taper. Cut volume ~40–60%, keep the intensity. Is worth about 2–3% on race day (Bosquet meta-analysis)",
  strengthSafe: "supervised strength and plyometric work is safe for teenagers and lowers injury risk, it won't stunt you, that's a myth (youth S&C consensus)",
  rampRule: "big jumps in weekly distance drive overuse injuries. Keep increases gradual, roughly 10% a week (Nielsen/Ramskov)",
};

export const KNOWLEDGE_FOR_PROMPT = `
CORE AI KNOWLEDGE BASE (cite naturally, don't dump: weave one relevant fact into an answer):

TRAINING LOAD & INJURY
- Gabbett 2016 "training-injury prevention paradox": high CHRONIC load is protective; the acute:chronic workload SPIKE (>1.5) is what injures. Hulin 2016 confirms ACWR>1.5 → sharp risk rise next week. Malone 2017: aerobic fitness buffers load. Ramskov/Nielsen: avoid weekly distance jumps >~30%; ~10%/week is the classic guardrail.

TRAINING METHOD
- Seiler polarized model: ~80% easy / 20% hard is how elites train; Stöggl 2014 showed polarized beat threshold-only for VO2max/performance in trained runners. Easy runs must be truly easy or they're neither recovery nor stimulus. 800m is ~60–70% aerobic; mile ~80%; 5K ~90–95% aerobic. Base training drives all of them.
- Daniels VDOT / Riegel (time ∝ distance^1.06): race times predict equivalent times and correct training paces across distances.

RECOVERY / MONITORING
- Sleep: Milewski 2014, <8h ≈ 1.7× injury risk in teens, dose-response; AASM. Teens need 8–10h; Mah. Sleep extension improves sprint & reaction time. HRV (Plews & Buchheit): read the 7-day rolling trend vs personal baseline, never one day; Vesterinen 2016. HRV-guided training ≥ fixed plans with fewer hard days. Rising resting HR + suppressed HRV = under-recovery/illness (Meeusen 2013 overtraining consensus).

FUELING / HEALTH (extra care for minors. Never discuss weight loss)
- RED-S / low energy availability (IOC, Mountjoy; Tenforde): under-fueling is a top cause of bone stress injuries and stalled performance; the fix is eating MORE, and persistent fatigue/menstrual changes/repeated bone injuries warrant a doctor. Iron deficiency is common in adolescent (esp. female) runners and causes unexplained fatigue and slowing. Worth a ferritin test via a doctor. Hydration: ~2% dehydration hurts performance but overdrinking is dangerous. Drink to thirst + electrolytes in heat (ACSM/Casa). Immunity J-curve (Nieman): peak weeks briefly raise cold risk. Protect sleep and food.

PEAKING / STRENGTH
- Taper (Bosquet meta-analysis; Mujika): ~2 weeks, cut volume 40–60%, KEEP intensity → ~2–3% gain. Youth strength training (Lloyd/Faigenbaum consensus): supervised lifting/plyometrics is safe for teens, improves running economy and injury resilience, the "stunts growth" idea is a myth.

RULES: cite a name/finding only when it strengthens the point; keep the runner's own numbers central; for sharp/localized/one-sided or worsening pain, or RED-S/iron red flags, route to coach/athletic-trainer/doctor, never diagnose.
`;
