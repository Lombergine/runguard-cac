# Design port — decisions

The mobile app is being ported from the Claude Design study
`RunGuard iOS App copy.dc.html`. The design's visual appearance is authoritative;
its mock data, its fake API calls and its backend are not.

Most of it ports literally and is not listed here. **This file lists only the
details that were processed and then NOT taken literally**, so that a reader
finding a difference can tell a decision from an oversight.

Rules that outrank the design, in order:

1. The six non-negotiables in [`visual-spec.md`](visual-spec.md).
2. Measured contrast floors, recorded in `app/src/theme/tokens.ts`.
3. `CLAUDE.md` — no hardcoded colour, size or spacing in a component.

---

## Type and colour

| # | Design | Ships | Why |
|---|---|---|---|
| 1 | Section eyebrow `600 13px` sans, `+0.06em` | `text.micro` — 11.5 mono, uppercase, `+0.12em` | Every other eyebrow in the app is already the mono micro role. Taking the design's sans here would give the app two eyebrow voices — the drift commit `470cddc` removed. The design's intent (small, uppercase, muted, tracked) survives. |
| 2 | `--muted: #94897b` | `#756C5F` light | The design value is **3.21:1** on the cream ground, under the 4.5:1 floor. Same hue and saturation, lower lightness. Recorded in `tokens.ts`. |
| 3 | Stat-tile figures `700 24px` sans, `-0.4px` | `text.stat` — 22 mono, tabular | Every numeral in this app is mono and tabular (`type.ts`). The design's *hierarchy* is kept; its typeface is not. |
| 4 | Large title `-0.6px` tracking | `text.largeTitle`, `+0.4` | Documented in `type.ts`: `+0.4` is iOS's own value for a large title, and Archivo at 34 is tighter than SF Pro Display. Negative tracking would make it read as a headline rather than navigation. |
| 5 | Accent text on `--accent` | `brandText`, now a PAIR — `#976106` light, `#C98A12` dark | `brand` is 2.01:1 — a fill, never a glyph, and `tokens.ts` keeps the two apart for that reason. The dark branch is new: as one static value `#976106` measured **3.11:1 on the dark well**, under the floor, on the one token whose whole job is "the ember you may write in". Forty-odd call sites had each measured it against the cream and none was wrong, so the light branch could not move — the dark one is the same hue lifted until it clears 4.5:1 on `#242019` (5.50 / 5.76 / 6.34 on well / card / bg), and stopped there rather than run up to `brand`. |
| 17 | Chat's "Try asking" eyebrow at `600 12px`, where every other eyebrow on the page is 13px | `text.micro` for both, as row 1 | An inconsistency in the design rather than a distinction: nothing makes the suggestion group a smaller rank than the groups around it. This app has ONE eyebrow rank; taking the design's two would have shipped its typo as a third voice. |
| 18 | Ordinary bubble text `400 15.5px / 1.45`; the profile name at `700 22px` sans | `text.base` (16.5 body) and `text.title` (19 display) | The scale is roles, not sizes (`type.ts`), and it is deliberately one step larger than a normal mobile app — 6am, one hand, arm's length. Minting a 15.5 body rank and a 22 display rank for two strings would leave the app with two body ranks 1pt apart and two title ranks 3pt apart. |

## Structure

| # | Design | Ships | Why |
|---|---|---|---|
| 6 | Separator after **every** row, including the last in a card | Separators between rows only | The design emits the rule inside its loop, so a hairline sits just above each card's bottom edge. Almost certainly unintended; it reads as a clipped row. |
| 7 | Hairlines at `0.5px` | `ruleWidth = 1.5` | `space.ts`: "a line that has to survive direct sunlight on a track needs more contrast than one read indoors." |
| 8 | Chevron `rgba(140,140,140,0.62)`, ember ramp as literal `rgb()` | Both become tokens | They land in SVG paint, where the design could not use a CSS var. `tokens.ts` already has `staticColor` / `darkColor` for exactly this case. |
| 19 | Bubble radius `16 16 4 16` / `16 16 16 4`; the suggested prompts as five separate 12-radius cards, each with shadow-1 | `radius.card` on both bubbles; the prompts as ONE `List` slab at `radius.group` | Two reasons. Radii come from `space.ts`, and neither 16 nor the 4pt tail is on that scale — a component may not mint one. And five separately-shadowed boxes are the web shape the iOS restyle exists to replace: iOS pools rows into one slab and lets the corner do the grouping (`components/List.tsx`). The design's 82% measure and its warm chip tint on the athlete's turn both ship. |
| 20 | Shadow-1 on the assistant's bubble and none on the athlete's | The same `shadow.card` on both | `tokens.ts`: a shadow is elevation, never emphasis. Two turns of one conversation drawn at two elevations makes one of them the louder — which is what type and position are for. |
| 21 | A 38pt round send button | `radius.pill` at `target.min` (48) | The design's shape at a legal size. § Quality floor sets a 48×48 minimum tap target, and this is the control hit one-handed at 6am. The pill field on `--fill` ships as drawn. |
| 22 | A 62pt profile avatar, and an outlined "Edit" pill beside the name | A 60pt initials circle; no Edit pill | 60 is `target.min + space.md`, so the size comes off the 4px scale rather than being typed in. Nothing on the profile is editable from the phone and there is no athlete-facing write for name, grade or school — a pill that opens nothing is the same lie as a chevron on an inert row. |

## The honesty rules

| # | Design | Ships | Why |
|---|---|---|---|
| 9 | Year grid: **dashed** = before your data starts, **dotted** = nothing recorded — and a caption saying *"dashed is nothing recorded"* | The spec's mapping: **dashed = Absent (not recorded), dotted = No run (rest), solid = a measured Zero.** Caption names all three. | Two separate faults. The design's caption contradicts its own code. More importantly its *mapping* contradicts the spec: it spends two border styles on flavours of "unknown", and the second one is dotted — which means **rest** everywhere else in this app. § Three kinds of nothing is categorical: "Absent is the only one that is dashed. Dashed means *we don't know*, everywhere in this app, with no exceptions." Drawing an unknown as a rest day is the exact collapse non-negotiable #4 forbids. *(Corrected after an earlier revision of this file recorded the design's mapping as shipping.)* |
| 10 | Per-run spike marked with a **half**-filled dial, labelled "unusual" | The **split** dot, from `StatusDot` | `visual-spec.md` maps half → `watch` and split → `unusual`. The design pairs the watch shape with the unusual word. Since shape carries the meaning here — so the states survive colour-blindness and glare — the wrong shape is not cosmetic. |
| 11 | The word "unusual" set in `#dc2626` | Advisory in `ink2`; the shape carries the state | Non-negotiable #5: advisory renders in body weight, lowercase, "colour last", with no red. A red word is not a red fill, but it still lets the type turn a description into an instruction. |
| 23 | Team footnote, verbatim: *"Your coach sees your training load, soreness and check-ins. They do not see your messages with RunGuard."* | The same first sentence; the second replaced by what is true — the coach sees the last **5** messages the athlete sends, word for word | The design's second sentence is false, and it is a privacy promise made to a minor. `website/src/lib/profile.ts:189-192` selects that athlete's last five `role = 'user'` messages and `dashboard/athlete/[id]/page.tsx:330-337` prints them in quotes. `chat.tsx`'s composer already says so; a profile screen saying the opposite would make the app contradict itself about the one thing an athlete might be deciding whether to type. Safety-intercepted rows ARE excluded by that query, which is why the shipped sentence says "you send" rather than "you exchange". |
| 24 | Max heart rate note: *"Measured, not the 220-minus-age estimate"* | `hrMax.label` — the server's own provenance sentence | The note is true only for `source = manual \| calibrated \| detected`. For `age` and `default` the figure **is** the 220-minus-age estimate, so the design's note would print a denial of what the number is. |
| 25 | "Export my data · A JSON file of everything RunGuard holds"; "Pair another device"; the device note "Last sync …" | None of the three ships | There is no export endpoint on `/api/mobile/*`; there is no pairing left to do — athletes sign in with their own email and password, and the device token the design's row assumed has been removed from the app and the database (see row 27); and `Profile` carries no sync timestamp (the only one that exists is `health.ts`'s local record, read by `connect.tsx`). The inert-row treatment is honest for a thing that exists and cannot be changed from the phone, not for a thing that does not exist. The athlete is not left without an answer: `privacy.tsx` states that a copy of your data, or its deletion, is a request by email, and the Privacy row's sub-line points there. |
| 26 | Design's profile order — the design's "Tier" row, and a centred "Sign out" row at the foot | Tier gated on `fitnessKnown`; no Sign out row | `computeFitness` falls back to `score = 50` whenever no week holds enough running, and 50 buckets to "Intermediate" — so an ungated tier row tells an athlete who has never trained what tier they are, as a plain labelled fact. And the row that used to say "Unpair this device" already called the same `signOut()`; `settings.tsx`, the screen that pushes this one, owns the row named "Sign out". Two names for one irreversible action on one screen is worse than either name alone. |
| 27 | The design's pairing flow — a code read off the coach's dashboard and typed into the phone | Nothing. `pair.tsx` is deleted; athletes sign in with the email and password they already have on the web | Asked for directly, and the design's own shape is the argument for it: a credential that has to be *displayed* on one screen and *typed* into another is a credential that gets screenshotted, read aloud across a track, and left in a photo roll. `CLAUDE.md` says a token is never rendered, and a pairing screen renders one by definition. `athletes.device_token` and `/api/athlete/rotate-token` are gone with it; `lib/auth.ts` keeps the retired key in `ALL_KEYS` only so signing out erases it from phones upgrading over an older build. |
| 28 | Coach calendar: Save / Cancel / **Clear day** | Save and Cancel. No Clear day | The web writer has a `DELETE` on `/api/team-plan`; `/api/mobile/coach/plan` has only `GET` and `POST`. Shipping the button against a route that does not exist would give a coach a control that appears to erase Thursday and does not — worse than not offering it, because they would stop looking. The write itself is real and shares the web's validator (`lib/teamPlan.ts`), so the two clients cannot store a day the other would refuse: verified round-trip, 6.2 mi in → 9977.9328 m stored → 6.20 mi back. |

## Not implemented at all

| # | Design | Why |
|---|---|---|
| 12 | `ios-frame.jsx` — device bezel, dynamic island, status bar, keyboard | A mockup scaffold, marked `@ds-adherence-ignore`. iOS provides all of it. |
| 13 | `support.js` — the `<x-dc>` runtime | Generated preview infrastructure for the design canvas. |
| 14 | The "Classical" design system (`_ds/…`) — Cormorant Garamond, Lora, gold, justified columns, "colour as stroke, never fill" | The design page links it and then overrides essentially all of it with RunGuard's own tokens. Its `_ds_bundle.js` exports zero components. Following its readme would contradict the page it is attached to. |
| 15 | `SAFETY_TRIGGERS` — a client-side keyword list | Safety interception is server-side in `website/src/lib/safety.ts`, before the intent engine and before any model. `CLAUDE.md`: "Do not route chat around that." |
| 16 | Safety reply as a chat bubble with a coloured border (`m.safety ? …`) | Non-negotiable #1 requires a `SafetyNotice` that shares no styles with chat, and that it be *structurally impossible* to pass one through the chat renderer. `ChatBubble` mints its text through a branded function so a flagged row cannot be constructed as a bubble. Colour and spacing are taken from the design; the structure is not. |
