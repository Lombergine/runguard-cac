# Visual spec — Leland XC athlete app

This document defines the **visual system only**. The brief (product, users,
constraints) is assumed known; this tells you how it should look.

Read this before writing any UI code.

---

## The feel, in one paragraph

Most running apps look like equipment: black backgrounds, neon accents, glowing
rings, numbers that pulse. This should look closer to a well-printed practice
schedule taped inside a locker. Calm, plain, obviously made for a specific team.
A stranger glancing at the screen should read *school* before they read *fitness
tech*.

---

## Non-negotiables

These override every aesthetic rule below. If a visual choice conflicts with one
of these, the visual choice loses.

1. **Safety-intercepted replies never use the chat message component.** They
   render through a separate `SafetyNotice` component that shares no styles with
   chat: full-bleed, no bubble, no avatar, no timestamp, no reactions, no
   long-press menu, not selectable for quote. It must be *structurally
   impossible* to pass one through the coach-facing renderer.
2. **Every date is explicit and local.** No bare relative labels. A check-in
   header reads `Today · Tue 14 Oct`, never `Today` alone. Any component
   displaying a date takes a **pre-formatted local string** — it never derives
   one.
3. **Units are welded to their numbers.** Distance renders as `4.2 mi` in a
   single node. Never a bare numeral next to a unit elsewhere in the layout.
   Never a metric and an imperial figure on the same screen.
4. **Absent, zero, and no-run are three different visual objects.** See "Three
   kinds of nothing". Never collapse them.
5. **Advisory language stays advisory.** `clear` / `watch` / `unusual` render in
   body weight, lowercase, as description. No alert banners, no warning
   triangles, no imperative verbs, no red fill. Type must not turn a description
   into an instruction.
6. **Readiness with no check-in renders as `—` and the word "unknown."** Never a
   number, never a partial fill, never a gray ring that could read as
   low-but-present.

---

## Tokens

```css
:root{
  /* surface — pre-dawn cool, not cream. cream + serif + terracotta is the
     generic-AI tell, and warm cream washes out in low morning light */
  --bg:#F3F5F4;          /* page */
  --card:#FFFFFF;        /* raised */
  --well:#E9EDEB;        /* sunken, for empty slots */

  /* ink — pushed darker than usual for outdoor sunlight legibility */
  --ink:#12161A;
  --ink-2:#3C444B;
  --muted:#6B7178;       /* still ≥4.5:1 on --bg; verify if you change --bg */

  /* rule — 1.5px, not hairline. hairlines disappear in bright sun */
  --rule:#D3DAD7;
  --rule-soft:#E4E9E7;

  /* accent — ONE. deliberately not green: green reads "good", and a blank
     must never read as fine. school-colour slot; swap for Leland's actual
     colour only if it isn't green or red */
  --accent:#2C4C8C;      /* deep field blue */
  --accent-soft:#DFE6F2;

  /* support — track surface. data and illustration only, never on a control */
  --track:#9A4A38;
  --track-soft:#F0E1DD;

  /* status — semantic only. never decorative, never on non-status elements */
  --ok:#2F6B4F;
  --watch:#8A6A1F;
  --unusual:#A33A2E;
  --unknown:#8A9098;     /* paired ALWAYS with a dashed border + label */
}
```

**Colour is rationed.** Almost the entire interface is white, near-black, and one
grey line weight. Colour appears maybe three times per screen: on the thing you
tap, on a status dot, on the body map. That scarcity is what makes it feel
considered rather than decorated. No coloured headers, no tinted card
backgrounds, no gradient anywhere.

**Lines instead of shadows.** Nothing floats. No drop shadows, no glassy layers,
no depth. Cards are defined by a single crisp rule — slightly heavier than the
fashionable hairline, because true hairlines vanish in sunlight. The result reads
as printed rather than as glass.

---

## Type

| Role | Family | Weights |
|---|---|---|
| Display | Archivo | 700/800 — headings, card titles, athlete name |
| Body | Source Sans 3 | 400/600 — all prose and labels |
| Mono | Spline Sans Mono | 500 — **every numeral**, `tabular-nums` mandatory |

Two typographic voices: friendly sentences, precise figures. Numbers are visibly
a different kind of thing from prose, and columns of them line up perfectly.

Scale is **one step larger than a normal mobile app throughout** — the primary
use is 6am, one hand, arm's length, possibly in cold or glare. It should feel
slightly oversized on a desk and exactly right at arm's length.

| Size | Family | Use |
|---|---|---|
| 11.5 | mono, uppercase, +0.12em | micro-labels |
| 14 | body | secondary metadata |
| 16.5 | body | base — set on `:root` |
| 19 | display | card titles |
| 22 | mono | inline stats |
| 30–40 | display 800, -0.02em | the check-in prompt |

**Space** — 4px scale: `4 8 12 16 24 32 48`. Card padding 16, section 24, page 20.

**Stance** — 12px cards, 10px controls, 1.5px borders, no shadows. Minimum tap
target 48×48, minimum gap between targets 8px.

**Motion** — 140ms state, 180ms reveal. No entrance animations on the home
screen. Skeletons reserve exact final height; the layout must not shift as data
arrives, because the user is looking at it for fifteen seconds and may tap before
it settles.

---

## The signature

**The home screen's hero is the check-in prompt itself, not readiness.**

This inverts the obvious layout, and it's the point. Ten of fourteen athletes
aren't reporting; readiness is ~55% weighted to self-report. So the screen's job
is **input, not display**. Readiness is demoted to a consequence of having
checked in.

When the check-in is missing — the majority state — the empty slot is the
largest, highest-contrast, most thumb-reachable element on the screen. An empty
state here is not a gap to apologise for; it is the product's main call to
action.

```
┌─────────────────────────────────┐
│ TUE 14 OCT · BEFORE PRACTICE    │  mono 11.5, muted
│                                 │
│ How did you sleep?              │  display 30–40, ink
│                                 │
│  ┌──────┐ ┌──────┐ ┌──────┐    │  three 48px+ targets,
│  │ Bad  │ │  OK  │ │ Good │    │  bottom third of screen,
│  └──────┘ └──────┘ └──────┘    │  reachable one-handed
│                                 │
│ ─────────────────────────────── │
│ Readiness  —  unknown until you │  dashed rule above,
│ check in                        │  mono + body, no ring
└─────────────────────────────────┘
```

**Two taps total:** this question, then soreness. No scrolling, no navigation, no
confirmation screen. On completion the card **collapses in place** to a one-line
receipt — `Checked in 6:12am · Tue 14 Oct` — and readiness appears below it.
Never a full-screen success state; it costs a tap to dismiss and the user is
walking to practice.

---

## Three kinds of nothing

The single most important component contract in the app. Build these as **three
distinct components** so they cannot drift into each other.

| State | Border | Fill | Value | Label |
|---|---|---|---|---|
| **Absent** — not recorded | 1.5px **dashed** `--rule` | `--well` | `—` mono, `--unknown` | "Not recorded" |
| **Zero** — genuine measured zero | 1.5px **solid** `--rule` | `--card` | `0` mono, `--ink` | unit attached, e.g. `0 mi` |
| **No run** — rest or nothing scheduled | 1.5px **dotted** `--rule-soft` | transparent | none | "No run. Rest day." |

**Absent is the only one that is dashed.** Dashed means *we don't know*,
everywhere in this app, with no exceptions. Zero is a fact and looks like every
other fact. Rest is calm and recedes — it is not a failure and must not be styled
like one.

Missing data looks unmistakably like a blank waiting to be filled, never like a
low-but-valid reading. Nothing greys out into ambiguity. **This is the visual
idea the whole product rests on.**

---

## Status and advisory

`prePracticeFlag` returns `clear` / `watch` / `unusual`. Render as a label with a
shape, **colour last**:

```
● clear      filled dot,  --ok
◐ watch      half dot,    --watch
◑ unusual    split dot,   --unusual
◌ unknown    dashed ring, --unknown
```

Body weight, lowercase, sentence case in the accompanying reason. **Shape carries
the meaning** so the states survive colour-blindness, glare, and greyscale. No
badge fills, no uppercase, no icons from a warning set.

Below the flag, one plain-English reason line in `--ink-2`, 14px:
*"Yesterday's pace was quicker than your usual easy run."* Descriptive, past
tense, about what was observed. Never a recommendation, never second-person
imperative.

**There is no composite score anywhere.** No large authoritative numeral, no
gauge, no 0–100. If a component would render a single number that summarises the
athlete, it's the wrong component.

Nothing shouts. No alert banners, no warning triangles, no red fills, no badges,
no confetti, no streak flames. The absence of urgency styling is a deliberate
position: the app describes, it doesn't instruct, and a design that yells would
undo that in a way words can't fix.

---

## Per-run spike warning

Attaches to a **specific run in the log**, not the home screen. Inline, within
the run's card, below the stats:

```
◑ unusual   This run was 2.1 mi longer than your recent long runs.
```

One line, same treatment as the advisory above. No modal, no interstitial, no
dismiss button — nothing here is urgent enough to interrupt, and interrupting
would make it read as a directive.

---

## Components

**Run card** — the three stats are **Distance / Time / Pace**, always those
three, always in that order, mono, right of a small route or session glyph.
Eyebrow carries the explicit local date and session type (practice, meet, long
run, easy). Session vocabulary uses the team's words, never *session*,
*workload*, *biometrics*, or *optimization*.

**Body map** — soreness picker. Must use the **exact** anatomy regions as the
coach's injury entry form; import from a shared constant, never re-list. Tap
targets 48px minimum even where regions are anatomically small — enlarge the hit
area, not the drawing. Selected regions fill `--track-soft` with a `--track`
outline. Support colour, not accent, because this is data entry about the body,
not a system action.

**Chat** — ordinary messages use standard bubbles, athlete right, coach left,
12px radius. `SafetyNotice` shares none of this: full-width, `--card` on a 3px
left rule in `--ink-2`, 16.5px body, generous padding, **no bubble geometry at
all**. It should look like the app speaking plainly, not like a participant in a
conversation.

**Nav** — bottom tab bar, four items, 48px targets. Home (check-in) is first and
default. Charts, calendar, and race history live behind tabs and are explicitly
secondary.

**Imagery — almost none.** One good illustration (the body diagram), drawn flatly
in the same line weight as the icons, like a printed anatomy key rather than a
rendered figure. Beyond that: initials in circles instead of photos, the school
mark once, nothing else. No stock photography, no mascot, no illustration system.
Partly because it competes with the check-in, and partly because **an app that
can surface a crisis reply cannot also have a cartoon character.**

**Roomy, not dense.** Screens hold few things. The home screen is essentially one
question and three buttons with a lot of air around them. Where a typical app
would fill space with a summary widget, this leaves the space empty. Emptiness is
doing work here — it points at the one action.

---

## Coach dashboard — inverted

Different viewer, different rules. Desktop, minutes not seconds, triaging ~14
athletes.

- **Denser:** base 15px, card padding 12, list rows over cards.
- **Whose data is this** is the thing that must never be misread. Athlete name is
  sticky at the top of any detail surface, display 19, full contrast, with the
  roster photo or initials adjacent. Never rely on the user remembering which row
  they clicked.
- The roster is a **table, not a feed**. One row per athlete, absent check-ins
  rendered with the same dashed treatment as the athlete app so *unknown* reads
  identically on both sides.
- **Sort by missing data, not by risk.** There is no risk ranking.
- **Fails closed:** if athlete identity or device token resolution is uncertain,
  the surface renders an empty state explaining what's unavailable. It never
  renders partial data with an unconfirmed name attached.
- **Safety-tagged exchanges never appear here in any form** — not the content,
  not a placeholder, not a count.

> **Status:** agreed target, not yet built. The web app currently uses a
> different visual language (warm cream, amber accent, gradients, shadows). This
> section is the direction for a later pass, not a description of current code.

---

## Quality floor

- 360px minimum width; test the check-in at 360×640 with the keyboard closed.
- Contrast ≥ 4.5:1 for all text including `--muted`; the target is outdoor
  sunlight, so treat 4.5 as the **floor rather than the goal**.
- `:focus-visible` 2px `--accent`, offset 3px.
- `aria-pressed` on check-in options, `aria-expanded` on disclosures,
  `aria-current` on nav. (React Native: `accessibilityState`,
  `accessibilityRole`.)
- Reduced motion respected.
- Dynamic Type / user font scaling must not break the check-in layout — it may
  scroll, but the three answer targets stay reachable.

---

## Before shipping a screen

1. Could a blank be mistaken for a healthy value anywhere on it?
2. Is any advisory phrased or weighted as an instruction?
3. Does any date appear without its explicit local day?
4. Is there a number on screen without its unit welded to it?
5. Could a safety reply reach this component?
6. Would this work at 6am, one hand, in glare, in fifteen seconds?
