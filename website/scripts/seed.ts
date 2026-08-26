import { localDay, localDayOffset } from "../src/lib/day";
/**
 * Seeds a realistic varsity XC team: ~120 days of training history per athlete,
 * with deliberate risk patterns so the dashboard tells a story:
 *  - most athletes: healthy base building (green)
 *  - 2 athletes: acute load spike right now (red)
 *  - 1 athlete: returning from time off, chronic base collapsed (caution/red)
 *  - 1 athlete: high monotony grinder (caution)
 */
import {
  insertActivity,
  upsertMetric,
  upsertCheckin,
  upsertCheckinSoreness,
  hashPassword,
  newDeviceToken,
} from "../src/lib/db";
import { sqliteOnlyHandle, close } from "../src/lib/db/driver";

const ARGS = process.argv.slice(2);
/** `--force` (or SEED_FORCE=1) is required to wipe a database holding non-seed data. */
const FORCE = ARGS.includes("--force") || !!process.env.SEED_FORCE;
/**
 * `--demo-tokens` restores the old guessable `demo_<name>` device tokens for local
 * demos. A device token is a full credential — it reads that athlete's profile and
 * writes HealthKit data — so anything derivable from this file must never exist
 * anywhere but a local SQLite file. That is guaranteed by the DB_DRIVER refusal in
 * seed(), which has no override.
 */
const DEMO_TOKENS = ARGS.includes("--demo-tokens");

type Pattern = "steady" | "spiking" | "returning" | "monotone" | "building" | "light";

const ATHLETES: {
  name: string;
  grade: number;
  sex: string;
  pattern: Pattern;
  baseKmWeek: number; // typical weekly km
  hue: number;
}[] = [
  { name: "Aditya Garg", grade: 11, sex: "M", pattern: "steady", baseKmWeek: 65, hue: 24 },
  { name: "Marcus Lee", grade: 12, sex: "M", pattern: "spiking", baseKmWeek: 55, hue: 0 },
  { name: "Sofia Ramirez", grade: 11, sex: "F", pattern: "spiking", baseKmWeek: 48, hue: 340 },
  { name: "Ethan Park", grade: 10, sex: "M", pattern: "returning", baseKmWeek: 50, hue: 268 },
  { name: "Grace Chen", grade: 12, sex: "F", pattern: "monotone", baseKmWeek: 52, hue: 200 },
  { name: "Dylan Foster", grade: 11, sex: "M", pattern: "building", baseKmWeek: 45, hue: 150 },
  { name: "Maya Patel", grade: 10, sex: "F", pattern: "steady", baseKmWeek: 42, hue: 300 },
  { name: "Jack O'Brien", grade: 9, sex: "M", pattern: "light", baseKmWeek: 30, hue: 40 },
  { name: "Lily Nguyen", grade: 11, sex: "F", pattern: "steady", baseKmWeek: 46, hue: 180 },
  { name: "Noah Kim", grade: 12, sex: "M", pattern: "building", baseKmWeek: 58, hue: 210 },
  { name: "Ava Thompson", grade: 10, sex: "F", pattern: "steady", baseKmWeek: 40, hue: 120 },
  { name: "Leo Martinez", grade: 9, sex: "M", pattern: "light", baseKmWeek: 28, hue: 80 },
  { name: "Zoe Walker", grade: 12, sex: "F", pattern: "steady", baseKmWeek: 50, hue: 250 },
  { name: "Sam Rivera", grade: 11, sex: "M", pattern: "monotone", baseKmWeek: 47, hue: 20 },
];

const DAY = 86400000;

// deterministic PRNG (mulberry32) so demo data is stable
let s = 0x9e3779b9;
function rand(): number {
  s |= 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function jitter(mult = 0.15): number {
  return 1 + (rand() * 2 - 1) * mult;
}

/** weekly km multiplier for a given "weeks before today" per pattern */
function weekMultiplier(p: Pattern, weeksAgo: number): number {
  switch (p) {
    case "steady":
      return 1;
    case "building":
      // gentle season build: 0.75 → 1.05
      return 1.05 - Math.min(0.3, weeksAgo * 0.02);
    case "spiking":
      // normal base, then the last two weeks explode
      return weeksAgo === 0 ? 1.9 : weeksAgo === 1 ? 1.05 : 0.92;
    case "returning":
      // injured/off weeks 2-5, tries to come back at full volume now
      if (weeksAgo === 0) return 1.15;
      if (weeksAgo <= 4) return 0.08;
      return 1;
    case "monotone":
      return 1;
    case "light":
      return 1;
  }
}

/**
 * Rows this seeder could not have written. The old guard only counted athletes with
 * an email/password_hash, and seed-created athletes never have one — so on a database
 * whose real users had all signed in through some other path (a device token, a
 * join code, a second team) the count was 0 and the DELETE below ran unguarded. Anything
 * here that is non-zero means the wipe would destroy data no reseed can regenerate.
 */
function nonSeedData(db: ReturnType<typeof sqliteOnlyHandle>): string[] {
  const probes: [string, string][] = [
    ["athlete account(s) with a login (email/password set)",
      "SELECT COUNT(*) c FROM athletes WHERE email IS NOT NULL OR password_hash IS NOT NULL"],
    ["athlete(s) outside the demo team",
      "SELECT COUNT(*) c FROM athletes WHERE team_id IS NULL OR team_id <> 1"],
    ["team(s) other than the demo team", "SELECT COUNT(*) c FROM teams WHERE id <> 1"],
    ["activity/activities not written by this seeder",
      "SELECT COUNT(*) c FROM activities WHERE source IS NULL OR source <> 'seed'"],
    ["health metric row(s) not written by this seeder",
      "SELECT COUNT(*) c FROM health_metrics WHERE source IS NULL OR source <> 'seed'"],
    ["chat message(s)", "SELECT COUNT(*) c FROM chat_messages"],
    ["logged workout(s)", "SELECT COUNT(*) c FROM workout_status"],
  ];
  const found: string[] = [];
  for (const [label, sql] of probes) {
    const { c } = db.prepare(sql).get() as { c: number };
    if (c > 0) found.push(`${c} ${label}`);
  }
  return found;
}

async function seed() {
  // Seeding wipes and rebuilds the roster, so it must never be pointed at a shared
  // database. sqliteOnlyHandle() enforces the same rule; this fires first so the
  // message names DB_DRIVER. There is deliberately no --force override: the script
  // has no Postgres path (it uses raw sqlite handles and sqlite_sequence).
  const target = (process.env.DB_DRIVER ?? "").trim().toLowerCase();
  if (target !== "" && target !== "sqlite") {
    throw new Error(
      `Refusing to seed with DB_DRIVER=${process.env.DB_DRIVER}. This script only ever ` +
        `runs against the local SQLite file. To populate a deployed database, seed ` +
        `locally and run scripts/migrate-to-pg.ts.`
    );
  }

  const db = sqliteOnlyHandle();
  const existing = db.prepare("SELECT COUNT(*) c FROM athletes").get() as { c: number };
  if (existing.c > 0) {
    const real = nonSeedData(db);
    if (real.length > 0 && !FORCE) {
      throw new Error(
        `Refusing to reseed: this database holds data this script did not create — ` +
          `${real.join("; ")}. Seeding wipes ALL athletes, teams, activities and chats, ` +
          `not just demo data, and none of that is recoverable. ` +
          `If you are sure, re-run with: npm run seed -- --force`
      );
    }
    console.log("Already seeded, clearing first…");
    db.exec(
      "DELETE FROM activities; DELETE FROM health_metrics; DELETE FROM race_results; DELETE FROM races; DELETE FROM checkins; DELETE FROM injuries; DELETE FROM goals; DELETE FROM chat_messages; DELETE FROM workout_status; " +
      // Explicit rather than relying on the ON DELETE CASCADE from teams:
      // SQLite only enforces foreign keys when PRAGMA foreign_keys is on, and
      // a wipe that silently leaves last season's plan behind would have the
      // seeder reporting a clean reseed over stale rows.
      "DELETE FROM team_plan_days; DELETE FROM athletes; DELETE FROM teams;"
    );
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('teams','athletes')");
  }

  // demo team (id 1) — coach demo login: coach@leland.demo / milemarker (or the demo button)
  db.prepare(
    `INSERT INTO teams (id, name, join_code, coach_name, coach_email, coach_password_hash)
     VALUES (1, 'Leland XC', 'LELAND-XC26', 'Coach', 'coach@leland.demo', ?)`
  ).run(hashPassword("milemarker"));
  const DEMO_TEAM = 1;

  const insertAthlete = db.prepare(
    `INSERT INTO athletes (name, grade, sex, event_group, avatar_hue, device_token, team_id)
     VALUES (?, ?, ?, 'distance', ?, ?, ?)`
  );

  const now = new Date();
  now.setHours(16, 30, 0, 0); // afternoons

  const seeded: { id: number; base: number; sex: string }[] = [];
  const issued: { athlete: string; device_token: string }[] = [];

  for (const spec of ATHLETES) {
    // Default: an unguessable token, same shape as a real pairing. `--demo-tokens`
    // brings back the derivable form, which is only reachable against local SQLite.
    const token = DEMO_TOKENS
      ? `demo_${spec.name.toLowerCase().replace(/[^a-z]/g, "")}`
      : newDeviceToken();
    issued.push({ athlete: spec.name, device_token: token });
    const res = insertAthlete.run(spec.name, spec.grade, spec.sex, spec.hue, token, DEMO_TEAM);
    const athleteId = Number(res.lastInsertRowid);
    seeded.push({ id: athleteId, base: spec.baseKmWeek, sex: spec.sex });

    // fitness → pace: faster kids run ~3:45/km easy... scale by base volume
    const easyPace = 385 - spec.baseKmWeek * 1.1 + rand() * 20; // s/km
    for (let d = 364; d >= 0; d--) {
      const date = new Date(now.getTime() - d * DAY);
      const dow = date.getDay(); // 0 Sun
      const weeksAgo = Math.floor(d / 7);
      const mult = weekMultiplier(spec.pattern, weeksAgo);

      // weekly structure
      let restDay = dow === 0; // Sundays off
      if (spec.pattern === "monotone") restDay = false; // never rests — that's the point
      if (spec.pattern === "light" && (dow === 0 || dow === 3)) restDay = true;
      if (restDay) continue;
      // occasional random missed day (never during an overtraining spike — that's the point)
      const spikeWeek = spec.pattern === "spiking" && weeksAgo <= 1;
      if (rand() < 0.06 && spec.pattern !== "monotone" && !spikeWeek) continue;

      // two lighter recovery blocks during the year (post-season breaks)
      const inBreak = (d > 330 && d <= 344) || (d > 150 && d <= 164);
      const weekKm = spec.baseKmWeek * mult;
      // distribute: long run Sat (25%), workout Tue/Thu (18% each, harder), easy otherwise
      let dayKm: number;
      let intensity: "easy" | "workout" | "long" = "easy";
      if (dow === 6) {
        dayKm = weekKm * 0.25;
        intensity = "long";
      } else if (dow === 2 || dow === 4) {
        dayKm = weekKm * 0.17;
        intensity = "workout";
      } else {
        dayKm = weekKm * 0.135;
      }
      if (spec.pattern === "monotone") {
        // same medium-hard run every single day
        dayKm = (spec.baseKmWeek / 7) * 1.15;
        intensity = "workout";
      }
      dayKm *= jitter(0.18);
      if (inBreak) dayKm *= 0.45;
      if (dayKm < 2) continue;

      // gradual season fitness gain: ~7% faster now than a year ago
      let pace = easyPace * (1 + 0.07 * (d / 365));
      let hrBase = 148;
      if (intensity === "workout") {
        pace = easyPace * 0.82;
        hrBase = 172;
      } else if (intensity === "long") {
        pace = easyPace * 0.95;
        hrBase = 155;
      }
      if (spec.pattern === "spiking" && weeksAgo === 0) hrBase += 8; // fatigue creep
      pace *= jitter(0.05);

      const duration = dayKm * pace;
      const start = new Date(date);
      start.setMinutes(start.getMinutes() + Math.floor(rand() * 40));

      await insertActivity({
        athlete_id: athleteId,
        source: "seed",
        external_id: `seed-${athleteId}-${d}`,
        name:
          intensity === "long"
            ? "Long run"
            : intensity === "workout"
              ? ["Tempo run", "Intervals", "Hill repeats", "Fartlek"][Math.floor(rand() * 4)]
              : "Easy run",
        type: "Run",
        start_time: start.toISOString(),
        distance_m: Math.round(dayKm * 1000),
        duration_s: Math.round(duration),
        avg_hr: Math.round(hrBase * jitter(0.03)),
        max_hr: Math.round((hrBase + 18) * jitter(0.03)),
        elevation_gain_m: Math.round(dayKm * (8 + rand() * 15)),
        calories: Math.round(dayKm * 62 * jitter(0.08)),
        cadence: Math.round((intensity === "workout" ? 182 : 172) * jitter(0.02)),
      });
    }

    // ----- daily recovery metrics from "Apple Health" (every day, not just training days) -----
    const fit = spec.baseKmWeek; // fitness proxy
    const restingBase = Math.round(57 - (fit - 30) * 0.22 + rand() * 3); // ~46–58 bpm
    const hrvBase = Math.round(60 + (fit - 30) * 0.75 + rand() * 6); // ~55–90 ms
    const vo2Base = 45 + (fit - 30) * 0.42; // ml/kg/min

    for (let d = 364; d >= 0; d--) {
      const weeksAgo = Math.floor(d / 7);
      const mult = weekMultiplier(spec.pattern, weeksAgo);
      const fitnessGain = 1 - d / 365; // 0 a year ago → 1 today

      const spikeStress = spec.pattern === "spiking" && weeksAgo <= 1;
      const returnShock = spec.pattern === "returning" && weeksAgo === 0;
      const monotoneStress = spec.pattern === "monotone" && rand() < 0.5;
      const stressed = spikeStress || returnShock || monotoneStress;
      const heavyWeek = mult > 1.2;

      let rhr = restingBase - 2 * fitnessGain; // fitter over the year → lower RHR
      if (stressed) rhr += 6 + rand() * 3;
      if (heavyWeek) rhr += 2;
      rhr += (rand() * 2 - 1) * 1.4;

      let hrv = hrvBase + 5 * fitnessGain;
      if (stressed) hrv *= 0.78;
      else if (heavyWeek) hrv *= 0.93;
      hrv += (rand() * 2 - 1) * 4;

      let sleep = 8 + (rand() * 2 - 1) * 0.7;
      if (stressed) sleep -= 1.0;
      sleep = Math.max(5.4, Math.min(9.5, sleep));

      const vo2 = vo2Base + 4 * fitnessGain + (rand() * 2 - 1) * 0.6;

      const date = new Date(now.getTime() - d * DAY);
      const iso = localDay(date);

      // sleep stage breakdown (deep ~18%, REM ~24%, light ~53%, awake ~5%)
      const hasSleep = rand() < 0.92;
      const sleepH = Math.round(sleep * 10) / 10;

      // Apple Watch doesn't log every metric every day — occasional gaps
      await upsertMetric({
        athlete_id: athleteId,
        date: iso,
        resting_hr: rand() < 0.96 ? Math.round(rhr) : null,
        hrv: rand() < 0.9 ? Math.round(hrv) : null,
        sleep_hours: hasSleep ? sleepH : null,
        sleep_deep: hasSleep ? Math.round(sleepH * (0.16 + rand() * 0.05) * 10) / 10 : null,
        sleep_rem: hasSleep ? Math.round(sleepH * (0.22 + rand() * 0.05) * 10) / 10 : null,
        sleep_light: hasSleep ? Math.round(sleepH * (0.5 + rand() * 0.06) * 10) / 10 : null,
        sleep_awake: hasSleep ? Math.round(sleepH * (0.03 + rand() * 0.04) * 10) / 10 : null,
        vo2max: d % 9 === 0 ? Math.round(vo2 * 10) / 10 : null, // VO2max measured sporadically
        spo2: rand() < 0.85 ? Math.round((96.5 + rand() * 2.4) * 10) / 10 : null,
        wrist_temp: rand() < 0.8 ? Math.round(((stressed ? 0.35 : 0) + (rand() * 0.5 - 0.25)) * 100) / 100 : null,
        resp_rate: rand() < 0.85 ? Math.round((13.5 + rand() * 2.5 + (stressed ? 1 : 0)) * 10) / 10 : null,
        source: "seed",
      });
    }

    // ----- daily check-ins (soreness, energy, motivation, stress) -----
    for (let d = 45; d >= 0; d--) {
      if (rand() < 0.25) continue; // kids don't log every day
      const date = localDayOffset(d, now);
      const weeksAgo = Math.floor(d / 7);
      const stressedNow =
        (spec.pattern === "spiking" && weeksAgo <= 1) ||
        (spec.pattern === "returning" && weeksAgo === 0);
      await upsertCheckin({
        athlete_id: athleteId,
        date,
        rpe: Math.round((5 + rand() * 3 + (stressedNow ? 1.5 : 0)) * 10) / 10,
        energy: Math.round((stressedNow ? 4 : 6.5) + rand() * 2.5),
        motivation: Math.round(6 + rand() * 3.5),
        academic_stress: rand() < 0.25 ? 1 : 0,
      });
      // multi-part soreness demo: stressed days can log more than one sore area independently
      const soreOptions = ["shins", "calves", "left knee", "achilles"];
      if (stressedNow && rand() < 0.6) {
        const parts = rand() < 0.4 ? 2 : 1;
        for (let i = 0; i < parts; i++) {
          await upsertCheckinSoreness({
            athlete_id: athleteId,
            date,
            body_part: soreOptions[Math.floor(rand() * soreOptions.length)],
            severity: Math.round(4 + rand() * 4),
          });
        }
      } else if (rand() < 0.3) {
        await upsertCheckinSoreness({
          athlete_id: athleteId,
          date,
          body_part: soreOptions[Math.floor(rand() * soreOptions.length)],
          severity: Math.round(1 + rand() * 3),
        });
      }
    }
  }

  // ----- races: season history + upcoming meets -----
  const insertRace = db.prepare(
    "INSERT INTO races (name, date, event, distance_m, location, team_id) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertResult = db.prepare(
    `INSERT INTO race_results (athlete_id, race_id, event, date, time_s, place, feel, splits, conditions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const iso = (daysFromNow: number) =>
    localDay(new Date(now.getTime() + daysFromNow * DAY));

  const pastRaces: { name: string; d: number; event: string; dist: number; loc: string; cond: string }[] = [
    { name: "Lynbrook Invitational", d: -300, event: "XC 5K", dist: 5000, loc: "Lynbrook HS", cond: "Warm, dry course" },
    { name: "Crystal Springs Invite", d: -272, event: "XC 5K", dist: 5000, loc: "Crystal Springs", cond: "Hilly, 24°C" },
    { name: "Mt. SAC Classic", d: -245, event: "XC 5K", dist: 5000, loc: "Mt. SAC", cond: "Hot, dusty" },
    { name: "League Finals (XC)", d: -218, event: "XC 5K", dist: 5000, loc: "Crystal Springs", cond: "Cool, perfect" },
    { name: "Winter Open (indoor)", d: -150, event: "Mile", dist: 1609, loc: "SF Armory", cond: "Indoor 200m track" },
    { name: "Spring Classic", d: -110, event: "800m", dist: 800, loc: "Leland HS", cond: "Windy backstretch" },
    { name: "District Trials", d: -75, event: "Mile", dist: 1609, loc: "Willow Glen", cond: "18°C, calm" },
    { name: "Summer Time Trial", d: -20, event: "5K", dist: 5000, loc: "Leland track", cond: "Team time trial" },
  ];
  const upcoming: typeof pastRaces = [
    { name: "De Anza League Finals", d: 5, event: "XC 5K", dist: 5000, loc: "Crystal Springs", cond: "" },
    { name: "CCS Championships", d: 19, event: "5K", dist: 5000, loc: "Toro Park", cond: "" },
  ];

  for (const r of [...pastRaces, ...upcoming]) {
    const raceId = Number(insertRace.run(r.name, iso(r.d), r.event, r.dist, r.loc, DEMO_TEAM).lastInsertRowid);
    if (r.d >= 0) continue; // no results for future races

    // simulate each athlete's time: fitness from base volume + season improvement
    const entries = seeded.map((a) => {
      const progress = 1 + (300 + r.d) / 300; // 1 → 2 across the year
      const vo2 = 45 + (a.base - 30) * 0.42 + 2.2 * progress + (a.sex === "F" ? -4 : 0);
      const v5k = 0.0587 * vo2 + 1.238;
      let t = (5000 / v5k) * (r.dist / 5000) ** 1.06;
      if (r.event === "XC 5K") t *= 1.03;
      t *= 1 + (rand() * 0.05 - 0.02); // race-day variance
      return { a, t: Math.round(t) };
    });
    entries.sort((x, y) => x.t - y.t);
    entries.forEach(({ a, t }, idx) => {
      // roughly even splits with a slight positive drift
      const nSplits = r.event === "800m" ? 2 : r.event === "Mile" ? 4 : 5;
      const per = t / nSplits;
      const splits = Array.from({ length: nSplits }, (_, i) =>
        Math.round(per * (0.98 + i * (0.04 / nSplits)))
      );
      const feel = t < per * nSplits * 0.995 ? "great" : rand() < 0.25 ? "rough" : "ok";
      insertResult.run(a.id, raceId, r.event, iso(r.d), t, idx + 1, feel, JSON.stringify(splits), r.cond);
    });
  }

  // ----- goals & injuries -----
  const insertGoal = db.prepare(
    "INSERT INTO goals (athlete_id, event, target) VALUES (?, ?, ?) ON CONFLICT(athlete_id, event) DO UPDATE SET target=excluded.target"
  );
  const insertInjury = db.prepare(
    "INSERT INTO injuries (athlete_id, date, body_part, note) VALUES (?, ?, ?, ?)"
  );
  for (const a of seeded) {
    // target = current PR minus a chunk
    const prRows = db
      .prepare("SELECT event, MIN(time_s) t FROM race_results WHERE athlete_id=? GROUP BY event")
      .all(a.id) as { event: string; t: number }[];
    for (const pr of prRows) {
      insertGoal.run(a.id, pr.event, Math.round(pr.t * 0.97));
    }
    insertGoal.run(a.id, "weekly_km", Math.round(a.base * 1.05));
  }
  // Ethan (returning pattern) has the injury that explains his time off
  const ethan = db.prepare("SELECT id FROM athletes WHERE name='Ethan Park'").get() as { id: number };
  insertInjury.run(ethan.id, iso(-38), "shin (left)", "Medial tibial stress — 4 weeks off running, cleared to return");
  const grace = db.prepare("SELECT id FROM athletes WHERE name='Grace Chen'").get() as { id: number };
  insertInjury.run(grace.id, iso(-200), "achilles (right)", "Tendinopathy last season — manages with eccentric calf work");

  /*
   * A written training calendar for the demo team.
   *
   * Without this the coach's Training calendar page opens empty, and "the days
   * you leave blank keep RunGuard's own suggestion" is a sentence about a
   * feature nobody can see working. Four weeks — the last two and the next
   * two — so the page shows both history and something to edit.
   *
   * Weekdays only, and Sunday is written as an explicit Rest day rather than
   * left blank: leaving it blank would also produce a rest day from the
   * template, and then the demo could not show the difference between "the
   * coach said rest" and "RunGuard picked rest".
   */
  const insertPlanDay = db.prepare(
    `INSERT INTO team_plan_days (team_id, date, type, distance_m, target_pace, details, why, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (team_id, date) DO NOTHING`
  );
  const WEEK: [string, number | null, string | null, string, string][] = [
    ["Easy run", 5, "8:30/mi", "Conversational the whole way. Meet at the track, out and back on the creek path.", "Aerobic base, and it flushes Sunday's long run out of the legs."],
    ["Workout: 5×1000m", 6.5, "6:05/mi", "5×1000m at threshold, 2:00 jog recovery. Even splits — the last one should look like the first.", "Threshold work raises the pace you can hold before you blow up."],
    ["Recovery run", 4, "9:15/mi", "Slowest run of the week, on purpose. Four relaxed strides at the end.", "Active recovery clears yesterday without adding to it."],
    ["Workout: hills", 6, null, "8×45s uphill hard, jog down. Drive the knees, stay tall.", "Strength without the pounding of track intervals — best injury insurance we have."],
    ["Easy run + strides", 5, "8:30/mi", "6×20s strides on the grass, walk back between.", "Settle the legs before Saturday and keep turnover sharp."],
    ["Long run", 9, "8:50/mi", "Steady and relaxed. Eat before, carry water if it's over 70°F.", "The aerobic engine gets built here. Biggest single fitness lever in the week."],
    ["Rest", null, null, "Full day off. Sleep in, legs up.", "Adaptation happens in recovery, not in training."],
  ];
  {
    // Monday of the week two weeks back, then 28 days forward.
    const start = new Date(localDay() + "T12:00:00");
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 14);
    for (let i = 0; i < 28; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const [type, mi, pace, details, why] = WEEK[i % 7];
      insertPlanDay.run(
        1,
        localDay(d),
        type,
        mi === null ? null : Math.round(mi * 1609.344),
        pace,
        details,
        why,
        "Coach Alvarez"
      );
    }
  }

  const counts = db
    .prepare(
      "SELECT a.name, COUNT(*) n, ROUND(SUM(distance_m)/1000.0) km FROM activities x JOIN athletes a ON a.id=x.athlete_id GROUP BY a.id ORDER BY a.name"
    )
    .all();
  console.table(counts);
  const raceCount = db.prepare("SELECT COUNT(*) c FROM race_results").get() as { c: number };
  console.log("Seeded", ATHLETES.length, "athletes,", raceCount.c, "race results.");

  // Printed once, here, because there is no other way to recover them.
  console.log(
    "\nDevice tokens — these are CREDENTIALS. Each one reads that athlete's full " +
      "profile and writes health data via /api/mobile/*. Do not commit or share them."
  );
  console.table(issued);
  console.log(
    DEMO_TOKENS
      ? "--demo-tokens: these are derived from the athlete names in this file, so anyone " +
          "with the source can guess them. Local demos only — never seed a shared database this way."
      : "These are random and change on every seed. Re-run with `npm run seed -- --demo-tokens` " +
          "for the fixed demo_<name> tokens the athlete demo button expects (local SQLite only)."
  );
}

seed().then(close);
