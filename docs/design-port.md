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
| 5 | Accent text on `--accent` | `brandText` `#976106` | `brand` is 2.01:1 — a fill, never a glyph. `tokens.ts` keeps the pair separate for this reason. |

## Structure

| # | Design | Ships | Why |
|---|---|---|---|
| 6 | Separator after **every** row, including the last in a card | Separators between rows only | The design emits the rule inside its loop, so a hairline sits just above each card's bottom edge. Almost certainly unintended; it reads as a clipped row. |
| 7 | Hairlines at `0.5px` | `ruleWidth = 1.5` | `space.ts`: "a line that has to survive direct sunlight on a track needs more contrast than one read indoors." |
| 8 | Chevron `rgba(140,140,140,0.62)`, ember ramp as literal `rgb()` | Both become tokens | They land in SVG paint, where the design could not use a CSS var. `tokens.ts` already has `staticColor` / `darkColor` for exactly this case. |

## The honesty rules

| # | Design | Ships | Why |
|---|---|---|---|
| 9 | Year-grid caption: *"dashed is nothing recorded"* | Caption corrected — **dashed is before your data starts; dotted is nothing recorded** | The design's own code disagrees with its caption: dashed is the pre-data state and dotted is the unrecorded one. A legend that mislabels the absent state is the exact failure non-negotiable #4 exists to prevent. The four cell states themselves port unchanged — they are that rule, drawn correctly. |
| 10 | Per-run spike marked with a **half**-filled dial, labelled "unusual" | The **split** dot, from `StatusDot` | `visual-spec.md` maps half → `watch` and split → `unusual`. The design pairs the watch shape with the unusual word. Since shape carries the meaning here — so the states survive colour-blindness and glare — the wrong shape is not cosmetic. |
| 11 | The word "unusual" set in `#dc2626` | Advisory in `ink2`; the shape carries the state | Non-negotiable #5: advisory renders in body weight, lowercase, "colour last", with no red. A red word is not a red fill, but it still lets the type turn a description into an instruction. |

## Not implemented at all

| # | Design | Why |
|---|---|---|
| 12 | `ios-frame.jsx` — device bezel, dynamic island, status bar, keyboard | A mockup scaffold, marked `@ds-adherence-ignore`. iOS provides all of it. |
| 13 | `support.js` — the `<x-dc>` runtime | Generated preview infrastructure for the design canvas. |
| 14 | The "Classical" design system (`_ds/…`) — Cormorant Garamond, Lora, gold, justified columns, "colour as stroke, never fill" | The design page links it and then overrides essentially all of it with RunGuard's own tokens. Its `_ds_bundle.js` exports zero components. Following its readme would contradict the page it is attached to. |
| 15 | `SAFETY_TRIGGERS` — a client-side keyword list | Safety interception is server-side in `website/src/lib/safety.ts`, before the intent engine and before any model. `CLAUDE.md`: "Do not route chat around that." |
| 16 | Safety reply as a chat bubble with a coloured border (`m.safety ? …`) | Non-negotiable #1 requires a `SafetyNotice` that shares no styles with chat, and that it be *structurally impossible* to pass one through the chat renderer. `ChatBubble` mints its text through a branded function so a flagged row cannot be constructed as a bubble. Colour and spacing are taken from the design; the structure is not. |
