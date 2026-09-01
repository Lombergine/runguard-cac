/**
 * The appearance preference: follow the phone, or override it.
 *
 * ── WHY THIS CAN EXIST WHEN THE OTHER SETTINGS ROWS CANNOT ──────────────────
 *
 * `settings.tsx` opens by explaining why none of the design's four toggles
 * ship: "a switch is a promise that something is stored and honoured", and
 * nothing in this build could keep any of them. This one it can. The
 * preference is stored, it is honoured on every launch, and the whole app
 * obeys it — so it is the first real control on that screen, and it is real
 * rather than decorative.
 *
 * ── HOW IT REACHES ~100 STATIC STYLESHEETS ──────────────────────────────────
 *
 * `Appearance.setColorScheme()`, not a React context.
 *
 * Every colour in `theme/tokens.ts` is a `DynamicColorIOS` pair, which the OS
 * resolves at paint time rather than JavaScript resolving at render time — that
 * is the entire reason the app got dark mode without threading a hook through
 * a hundred `StyleSheet.create` calls. A context could not override those: the
 * OS would go on resolving them against the system appearance no matter what
 * the tree said.
 *
 * `setColorScheme` moves the appearance the OS itself resolves against, for
 * this app only. So one call at launch turns every dynamic pair, every
 * `useColorScheme()` (the native header, the SVG ramps), and the status bar
 * over together. There is nothing to thread and nothing that can be missed.
 *
 * ── WHERE IT IS STORED, AND WHY IT SURVIVES SIGNING OUT ─────────────────────
 *
 * SecureStore, because it is the only store this app has — but deliberately NOT
 * in `auth.ts`'s `ALL_KEYS`, which is the list sign-out erases. `ALL_KEYS` is
 * about credentials and athlete data. Whether someone prefers a dark screen is
 * neither: it is a property of the phone and the person holding it, not of the
 * account, and wiping it on sign-out would mean a shared team phone flips back
 * to light between athletes for no reason anyone chose.
 *
 * `auth.ts` names this file in its own docblock so the contract stays complete:
 * every key this app writes is accounted for in one of the two lists, with a
 * stated reason for which.
 */
import { Appearance } from "react-native";
import * as SecureStore from "expo-secure-store";

/** Not in `auth.ts`'s ALL_KEYS. See the note above. */
const KEY = "runguard.appearance";

/**
 * `system` follows the phone, which is the default and what the app did before
 * this existed. The other two override it.
 */
export type AppearanceChoice = "system" | "light" | "dark";

export const APPEARANCE_CHOICES: readonly AppearanceChoice[] = [
  "system",
  "light",
  "dark",
];

/** What the row says for each. Sentence case; these are values, not commands. */
export const APPEARANCE_LABEL: Record<AppearanceChoice, string> = {
  system: "Follow phone",
  light: "Light",
  dark: "Dark",
};

function isChoice(v: string | null): v is AppearanceChoice {
  return v === "system" || v === "light" || v === "dark";
}

/**
 * Hand the choice to the OS.
 *
 * `"unspecified"` is RN's "stop overriding", which is what `system` means here
 * — not a third appearance but the absence of a preference. (Not `null`: this
 * version types `setColorScheme` as `'light' | 'dark' | 'unspecified'`, and
 * `getColorScheme` is the one that can hand back `null`.)
 */
export function applyAppearance(choice: AppearanceChoice): void {
  Appearance.setColorScheme(choice === "system" ? "unspecified" : choice);
}

/**
 * Read the stored choice, defaulting to `system`.
 *
 * Swallows a SecureStore failure rather than surfacing it: a keychain that
 * cannot be read is a reason to follow the phone, not a reason to fail to
 * launch. The same posture `auth.ts`'s `read()` takes.
 */
export async function loadAppearance(): Promise<AppearanceChoice> {
  try {
    const stored = await SecureStore.getItemAsync(KEY);
    return isChoice(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

/**
 * Store the choice and apply it.
 *
 * Applied FIRST, so the screen turns over even if the write fails — a
 * preference that does not persist is a smaller failure than a control that
 * appears to do nothing when tapped.
 */
export async function setAppearance(choice: AppearanceChoice): Promise<void> {
  applyAppearance(choice);
  try {
    await SecureStore.setItemAsync(KEY, choice);
  } catch {
    // Nothing to tell the user: the appearance did change, and it will simply
    // be back to following the phone next launch.
  }
}
