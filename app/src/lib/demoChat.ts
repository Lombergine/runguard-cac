/**
 * The transcript the demos show, and the reason the composer is off.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * Two separate decisions that happen to meet on one screen.
 *
 * 1. The chat is NOT RELEASED. It reaches a model, and that is not something to
 *    switch on quietly. So no build sends a message: the composer is disabled
 *    everywhere, for demo visitors and real athletes alike.
 * 2. A demo still has to SHOW the feature. "Coming soon" over an empty page
 *    demonstrates nothing, and the chat is the part of RunGuard people ask
 *    about first.
 *
 * So the demos get a fixed transcript and everyone gets a disabled composer.
 *
 * ── THESE ARE FIXTURES, AND THEY SAY SO ─────────────────────────────────────
 *
 * Nothing here is generated, and nothing here is a real athlete's words. The
 * screen labels the transcript as an example rather than passing it off as the
 * visitor's own history — a demo that fakes YOUR data is a different and worse
 * thing than a demo that shows AN example.
 *
 * ── AND THEY OBEY THE SAME RULES A REAL REPLY WOULD ─────────────────────────
 *
 * Every `assistant` line below is written to the constraint the real engine is
 * held to: it DESCRIBES what the data shows and never prescribes. No "you
 * should", no "rest", no diagnosis. If a fixture broke that rule it would
 * teach the visitor the product does something it must not do.
 *
 * `safety: false` on every row, and that is not a default being accepted — a
 * safety-flagged row must render through `SafetyNotice` and can never reach
 * `ChatBubble` (non-negotiable #1). A canned transcript has no business
 * carrying one: interception is a server behaviour, and faking it here would
 * be the one piece of theatre this file must not perform.
 */
import type { ChatMessage } from "./types";

/** The athlete's example exchange. Their own training, described back to them. */
export const DEMO_CHAT_ATHLETE: readonly ChatMessage[] = [
  {
    role: "user",
    text: "Why is my readiness lower than last week?",
    safety: false,
  },
  {
    role: "assistant",
    text:
      "Three things moved. Your resting heart rate is 4 bpm above your own " +
      "baseline across the last three mornings, sleep averaged 6.8 h against " +
      "your usual 7.9 h, and you reported your left shin at 4 out of 10 " +
      "yesterday — the third day running you have named it. Readiness weighs " +
      "self-report most heavily, so the shin is most of the change.",
    safety: false,
  },
  {
    role: "user",
    text: "Was Saturday's long run too much?",
    safety: false,
  },
  {
    role: "assistant",
    text:
      "It was 8.7 mi, which is 31% longer than anything you had run in the " +
      "month before it. Your acute:chronic ratio moved from 0.94 to 1.28 that " +
      "week. That is the pattern RunGuard flags as unusual — it is a " +
      "description of the jump, not a verdict on the run. Your coach sees the " +
      "same figures.",
    safety: false,
  },
];

/** The coach's. A squad, not a person — and never one athlete's private text. */
export const DEMO_CHAT_COACH: readonly ChatMessage[] = [
  {
    role: "user",
    text: "Who should I look at before practice today?",
    safety: false,
  },
  {
    role: "assistant",
    text:
      "Three of fourteen are outside their usual range. Two have a session " +
      "well past their recent longest in the last seven days, and one has not " +
      "reported in four days, so there is nothing recent to read for them. " +
      "The roster shows which is which; this is what was observed, and the " +
      "call is yours.",
    safety: false,
  },
  {
    role: "user",
    text: "Is the team's mileage down this week?",
    safety: false,
  },
  {
    role: "assistant",
    text:
      "Yes — 172.8 mi across the athletes with run history, against 433.6 mi " +
      "the week before. Most of that is three athletes who logged nothing " +
      "rather than a squad-wide drop, so the total reads lower than the " +
      "training actually was.",
    safety: false,
  },
];
