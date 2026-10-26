# Disclosure of AI use — RunGuard, Congressional App Challenge 2026

This file states exactly what was written by whom. The CAC rules permit AI
tools "to support specific aspects of the project" provided all use is fully
disclosed and the students can demonstrate technical understanding. We would
rather over-disclose than leave a judge guessing.

## 1. The team and the base product (July–September 2026)

RunGuard is a two-person team entry: **Aditya Garg** (GitHub accounts
`Lombergine` and `runguard663-ui`) and **Pranav** (`peanuts-ctr`). The
repository history shows the split: of 117 commits before this branch, 56 are
Aditya's and 55 are Pranav's, with 6 more under Aditya's full name.

The base product is two projects in one repository:

- `website/` — the Next.js coach dashboard, the athlete web portal, the mobile
  API, and the scoring engine (`src/lib/risk.ts`, `engine.ts`, `profile.ts`):
  EWMA acute:chronic workload ratio, TRIMP, monotony, readiness, recovery.
- `app/` — the Expo / React Native iOS app: Apple Health sync, the morning
  check-in, body scan, training, recovery, stats, races, coach tabs.

The repository contains `CLAUDE.md` and `AGENTS.md` files from that period,
which means AI coding assistants (Claude Code) were used during base
development too.

> **[Aditya and Pranav, fill this in before submitting — do not leave it
> blank or vague.]** State which parts of the base you each wrote by hand,
> which were AI-assisted, and what the assistant did.

## 2. The statistics: Aditya's Python package `acwr`

The ratio methods, the self-audit, the personal threshold and the data-quality
checks are ports of Aditya's published Python package
[`acwr`](https://github.com/Lombergine/acwr) (`pip install acwr`,
ORCID 0009-0003-1004-500X). That package carries its own `AI-USAGE.md`, which
states that Claude wrote the large majority of its source and tests as a pair
programmer under Aditya's direction, scope, domain knowledge and real training
data (1,018 of his own runs over three years), and that Aditya reviewed,
questioned and takes responsibility for every claim in it. That disclosure
applies to everything ported from it here.

## 3. RunGuard 2.0 (the night of October 25–26, 2026)

Everything on the `cac-2.0` branch was written in one overnight session with
**Claude Code (Claude Fable 5.1)** as an AI pair programmer, directed by
Aditya. Every new or modified file carries the header `Added for RunGuard 2.0
(CAC 2026), AI-assisted, see DISCLOSURE.md`.

**New files Claude Code wrote the majority of:**

| File | What it is |
|---|---|
| `website/src/lib/acwrDiagnostics.ts` | The three ratio methods, the rescaling self-audit, the personal-threshold report, the data check, the `athleteAudit` bundle, and `compareToNull` (port of `acwr`) |
| `website/src/lib/acwrDiagnostics.test.ts` | 25 vitest cases checking every value against the Python reference (37 in all with gait and compareToNull) |
| `website/src/lib/gait.test.ts` | 4 cases for the gait model |
| `website/src/lib/compareToNull.test.ts` | 8 cases for the Impellizzeri test against the Python reference |
| `website/src/lib/teamAudit.ts` | Pools the roster's series with the injury log; per-athlete score trust |
| `website/src/components/TeamAuditPanel.tsx` | The coach dashboard's "Can the score be trusted on this team?" panel |
| `website/src/components/athlete/AuditPanels.tsx` | The web versions of the threshold, self-audit and data-check panels |
| `website/src/lib/__fixtures__/generate_reference.py` | Script that produces the Python reference numbers |
| `website/src/lib/__fixtures__/acwr_reference.json` | Those numbers (generated, not hand-written) |
| `website/vitest.config.ts` | Test runner config |
| `app/src/lib/gait.ts` | Gait drift heuristic and the labelled sample dataset |
| `app/src/components/InsightPanels.tsx` | The four Stats panels and the load-vs-drift quadrant |
| `DISCLOSURE.md`, `docs/cac/*.md` | This file and the submission documents |

**Existing files Claude Code modified (listed changes):**

| File | Change |
|---|---|
| `website/src/lib/profile.ts` | Computes `audit` over a year of the athlete's own EWMA series |
| `website/src/app/api/mobile/me/route.ts` | Allow-lists `audit` onto the phone payload |
| `website/src/app/dashboard/page.tsx` | Mounts the team audit panel |
| `website/src/app/dashboard/athlete/[id]/page.tsx`, `website/src/components/athlete/tabs.tsx`, `website/src/components/charts.tsx` | Audit panels and the personal line on the web |
| `website/package.json` | Adds vitest and the `test` / `typecheck` scripts |
| `website/scripts/seed.ts` | The sample team gets a generated year of load-driven injuries so the team test has events; the demo banner already says the team is made up |
| `app/src/lib/health.ts` | Two running-dynamics read scopes and `readRunningDynamics` (still read-only) |
| `app/src/lib/types.ts` | `Profile.audit` and the `AthleteAudit` type |
| `app/src/components/charts/AcwrChart.tsx` | Draws the athlete's own 95th-percentile line in violet |
| `app/src/app/(tabs)/stats.tsx` | Mounts the panels under the workload chart; `?scroll=insights` deep-link anchor |

**What Aditya did tonight:** chose the features and their order, supplied the
`acwr` package and its tests as the reference, decided the gait channel would
demo on labelled sample data because his Garmin writes no running dynamics to
Health, ran the app on his iPhone against the local server, reviewed every file
before commit, and was quizzed on every core piece until he could explain it
without notes (`docs/cac/QUIZ.md`).

**What Aditya did not do tonight:** type most of the 2.0 code. Stated plainly
because the rules ask for it.

A parallel Swift implementation of the same statistics
(`RunGuardCore`, github.com/Lombergine/runguard-cac) was built the same night
and tested against the same fixture; it is a cross-check, not part of this
submission.

## 4. Runtime AI

RunGuard's athlete chat (`website/src/lib/ai.ts`) predates 2.0 and is part of
the base product. **No 2.0 feature calls a language model at runtime.** Every
2.0 number is computed by the server's TypeScript from the athlete's own data,
and the gait channel is computed on the phone and never sent anywhere.

## 5. Open-source components

Runtime: Next.js, React, React Native, Expo and expo-router,
`@kingstinct/react-native-healthkit`, `react-native-health-connect`,
`react-native-svg`, Recharts, better-sqlite3 / postgres, zod, date-fns.
Development: TypeScript, vitest, ESLint, Tailwind. Reference generation only:
Python with numpy, pandas, scipy and `acwr` (MIT, Aditya's).

## 6. References

- Impellizzeri et al. (2021). Time to dismiss ACWR and its underlying theory. *Sports Medicine*, 51(3), 581–592.
- Impellizzeri et al. (2020). Acute:chronic workload ratio: conceptual issues and fundamental pitfalls. *IJSPP*, 15(6), 907–913.
- Williams et al. (2017). Better way to determine the acute:chronic workload ratio? *BJSM*, 51(3), 209–210.
- Gabbett (2016). The training–injury prevention paradox. *BJSM*, 50(5), 273–280.
- Foster (1998). Monitoring training in athletes with reference to overtraining syndrome. *MSSE*, 30(7), 1164–1168.
- Apple HealthKit running dynamics: `HKQuantityTypeIdentifierRunningGroundContactTime`, `…RunningVerticalOscillation` (iOS 16+, watchOS 9+).
