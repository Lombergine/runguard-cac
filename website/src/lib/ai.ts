/**
 * Is a model actually answering, right now, on this deployment?
 *
 * WHY THIS EXISTS. The product is called RunGuard AI and is meant to be — the
 * branding is not a mistake to be scrubbed. But `lib/coach.ts` is gated entirely
 * on OLLAMA_MODEL, and that points at localhost, so on a serverless deployment
 * no model exists and every reply comes from the rule engine reading the
 * athlete's own numbers.
 *
 * So there are two true states, and the interface should tell the truth in each
 * rather than picking one and hardcoding it:
 *
 *   model configured  → "Ask RunGuard AI", and the privacy policy discloses the
 *                       provider, because it should.
 *   no model          → "Ask RunGuard", and the policy says plainly that nothing
 *                       leaves our servers, because nothing does.
 *
 * This is one flag rather than a branch of the repo or a second set of copy: a
 * demo deployment and the real product run the same code and say different
 * things because they ARE different, not because someone remembered to edit a
 * string before deploying.
 *
 * It reads the same variable coach.ts gates on, deliberately — one source of
 * truth means the label cannot disagree with what answered. When a hosted
 * provider is wired up, add its key here and to coach.ts together.
 */
export function aiEnabled(): boolean {
  return Boolean(process.env.OLLAMA_MODEL);
}

/** "RunGuard AI" or "RunGuard", depending on what is actually answering. */
export function assistantName(): string {
  return aiEnabled() ? "RunGuard AI" : "RunGuard";
}

/** The chat tab's label. */
export function chatTabLabel(): string {
  return aiEnabled() ? "AI Chat" : "Chat";
}
