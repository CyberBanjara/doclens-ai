import { deleteCachedVoice } from "@/lib/voiceCache";

const TTS_ONBOARDED_LS = "doclens:tts-onboarded";

/**
 * Cache of active ONNX InferenceSession instances, keyed by model identity.
 * Exported directly (rather than behind get/set wrappers) because the
 * onnxruntime-web monkey-patch in TtsContext's voice-engine-init effect reads
 * and writes it inline as part of patching `InferenceSession.create`.
 */
export const ONNX_SESSION_CACHE = new Map<string, any>();

/**
 * Iterates over all cached ONNX sessions, releases them to reclaim WASM heap memory,
 * and clears the cache.
 */
export async function clearTtsSessionCache() {
  for (const session of ONNX_SESSION_CACHE.values()) {
    try {
      if (session && typeof session.release === "function") {
        await session.release();
      }
    } catch (e) {
      console.warn("[TTS] Failed to release ONNX InferenceSession:", e);
    }
  }
  ONNX_SESSION_CACHE.clear();
}

/** Mutex chain ensuring ONNX inference calls are strictly serialized */
let inferenceChain: Promise<any> = Promise.resolve();

/**
 * A previously-cached voice model (OPFS/IndexedDB) can end up mismatched with its
 * config — e.g. downloaded mid-update from the upstream Piper voices repo — which
 * surfaces as an ONNX Gather/index-out-of-bounds error at inference time. Since the
 * bad pair is cached indefinitely, the user would otherwise be stuck forever. Detect
 * that failure signature, wipe the cached copy of just that voice, and retry once
 * with a fresh download.
 *
 * Runs all inferences through a serialized mutex chain to prevent concurrent WASM clashes.
 */
export function predictWithRecovery(
  tts: any,
  params: { text: string; voiceId: string | null },
  onProgress?: (progress: any) => void,
): Promise<Blob> {
  const task = async (): Promise<Blob> => {
    try {
      return await tts.predict(params, onProgress);
    } catch (err: any) {
      const message = String(err?.message || err || "");
      const looksLikeCorruptedModel = /Gather|out of data bounds/i.test(message);
      if (!looksLikeCorruptedModel) throw err;

      console.warn(
        `[TTS] Voice model "${params.voiceId}" failed inference (likely a corrupted/stale cached copy) — clearing cache and retrying:`,
        message,
      );
      await clearTtsSessionCache();
      if (params.voiceId) await deleteCachedVoice(params.voiceId);
      return await tts.predict(params, onProgress);
    }
  };

  const resultPromise = inferenceChain.then(task, task);
  inferenceChain = resultPromise.catch(() => {});
  return resultPromise;
}

/**
 * Explicit flag set once the user has picked a language/voice through the
 * onboarding dialog or settings. Kept separate from the selected-voice-URI key
 * because that key can also be written by an automatic fallback (see
 * TtsContext's "Auto-switch voice when language filter excludes current
 * selection" effect), which would otherwise make onboarding look "complete"
 * without any user action.
 */
export function hasCompletedTtsVoiceSetup(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(TTS_ONBOARDED_LS) === "true";
}

export function markTtsVoiceSetupComplete(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TTS_ONBOARDED_LS, "true");
}
