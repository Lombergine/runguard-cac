/**
 * JS side of the camera gait check. The native module (ios/GaitVisionModule.swift)
 * runs Apple Vision body pose over a clip on the phone and returns summary
 * numbers only. Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md.
 */
import { requireOptionalNativeModule } from "expo-modules-core";

export type GaitVisionResult = {
  durationS: number;
  fps: number;
  framesProcessed: number;
  framesWithPose: number;
  meanConfidence: number;
  ok: boolean;
  /** Why `ok` is false, in words the runner can act on. */
  reason?: string;
  cadenceSpm?: number;
  oscillationPctTorso?: number;
  contactLeftMs?: number;
  contactRightMs?: number;
  /** (left - right) / mean, in percent. Positive = left foot longer on the ground. */
  contactAsymmetryPct?: number;
};

type NativeModule = { analyzeVideo(uri: string, targetFps: number): Promise<GaitVisionResult> };

const native = requireOptionalNativeModule<NativeModule>("GaitVision");

/** False on Android, on the web, and on a build made before the module existed. */
export function isGaitVisionAvailable(): boolean {
  return native !== null;
}

export async function analyzeVideo(uri: string, targetFps = 15): Promise<GaitVisionResult> {
  if (!native) throw new Error("The camera gait check needs the iOS build of RunGuard.");
  return native.analyzeVideo(uri, targetFps);
}
