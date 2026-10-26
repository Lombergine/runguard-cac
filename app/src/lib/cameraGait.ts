/**
 * The camera gait check: pick or record a short side-view running clip,
 * analyze it on the phone with Apple Vision (modules/gait-vision), and keep
 * a small local history so the next check has something to compare against.
 *
 * Nothing here is sent anywhere. The history lives in the keychain-backed
 * store the Health sync already uses, as a few hundred bytes of numbers.
 * The thresholds are heuristics and are labelled as such on screen.
 *
 * Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";

import { analyzeVideo, isGaitVisionAvailable, type GaitVisionResult } from "../../modules/gait-vision";

const KEY = "runguard.cameraGait.v1";
const MAX_HISTORY = 12;

export type CameraGaitCheck = GaitVisionResult & {
  /** ISO instant the clip was analyzed. */
  at: string;
  /** How the clip was made: just now with the camera, or picked from the library. */
  source: "camera" | "library";
};

/** Heuristic thresholds. Not clinically validated. */
export const ASYMMETRY_FLAG_PCT = 10;
export const BOUNCE_DRIFT_FLAG = 0.10;
export const CADENCE_DRIFT_FLAG = 0.05;

export { isGaitVisionAvailable };

async function pick(source: "camera" | "library"): Promise<string | null> {
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["videos"],
    videoMaxDuration: 12,
    quality: 0.7,
    allowsEditing: false,
  };
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  }
  const res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.length) return null;
  return res.assets[0].uri;
}

/** Record (or choose) a clip and analyze it. Null when the runner cancelled. */
export async function checkGait(source: "camera" | "library"): Promise<CameraGaitCheck | null> {
  const uri = await pick(source);
  if (!uri) return null;
  return analyzeClip(uri, source);
}

/** Analyze a clip the caller already has. Used by the dev deep link too. */
export async function analyzeClip(uri: string, source: "camera" | "library"): Promise<CameraGaitCheck> {
  const result = await analyzeVideo(uri, 15);
  const check: CameraGaitCheck = { ...result, at: new Date().toISOString(), source };
  if (check.ok) await remember(check);
  return check;
}

export async function history(): Promise<CameraGaitCheck[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CameraGaitCheck[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function remember(check: CameraGaitCheck): Promise<void> {
  const prior = await history();
  const next = [check, ...prior].slice(0, MAX_HISTORY);
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(next));
  } catch {
    // A full or locked store loses one check, not the app.
  }
}

export async function forgetHistory(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // nothing to forget
  }
}

export type GaitComparison = {
  baselineChecks: number;
  cadenceChange: number | null;
  bounceChange: number | null;
  asymmetryNow: number | null;
  flags: string[];
};

/**
 * This check against the median of the previous ones (uncoupled: the new
 * check is not in its own baseline). With fewer than two prior checks there
 * is no baseline and only the asymmetry reading is judged.
 */
export function compare(check: CameraGaitCheck, prior: CameraGaitCheck[]): GaitComparison {
  const base = prior.filter((p) => p.ok && p.at !== check.at);
  const median = (xs: number[]) => {
    const v = [...xs].sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  const rel = (now: number | undefined, then: number | null) => (now === undefined || then === null || then === 0 ? null : (now - then) / then);
  const enough = base.length >= 2;
  const cadenceChange = enough ? rel(check.cadenceSpm, median(base.map((b) => b.cadenceSpm ?? NaN).filter(Number.isFinite))) : null;
  const bounceChange = enough ? rel(check.oscillationPctTorso, median(base.map((b) => b.oscillationPctTorso ?? NaN).filter(Number.isFinite))) : null;
  const asym = check.contactAsymmetryPct ?? null;
  const flags: string[] = [];
  if (asym !== null && Math.abs(asym) > ASYMMETRY_FLAG_PCT) {
    flags.push(`${asym > 0 ? "Left" : "Right"} foot on the ground ${Math.abs(asym).toFixed(0)}% longer than the other`);
  }
  if (bounceChange !== null && bounceChange > BOUNCE_DRIFT_FLAG) flags.push(`Vertical bounce up ${(bounceChange * 100).toFixed(0)}% vs. your earlier checks`);
  if (cadenceChange !== null && cadenceChange < -CADENCE_DRIFT_FLAG) flags.push(`Cadence down ${(-cadenceChange * 100).toFixed(0)}% vs. your earlier checks`);
  return { baselineChecks: base.length, cadenceChange, bounceChange, asymmetryNow: asym, flags };
}
