import { computeSettingsHash, type PageAi, type PageAiSummaryEntry, type PageOverrides } from "@/lib/storage";
import {
  TRANSLATION_STYLES,
  EXPLANATION_STYLES,
  type Globals,
} from "@/lib/openrouter";
import { dispatchDocEvent } from "@/lib/docEvents";
import { cleanAiText } from "./cleanAiText";

export { cleanAiText };

export function effective(globals: Globals, ov?: PageOverrides) {
  const mode = ov?.mode ?? globals.mode;
  let rawStyle = ov?.style ?? globals.style;

  if (mode === "translate") {
    if (!rawStyle || !TRANSLATION_STYLES.some((s) => s.id === rawStyle)) {
      rawStyle = "Native";
    }
  } else {
    if (!rawStyle || !EXPLANATION_STYLES.some((s) => s.id === rawStyle)) {
      rawStyle = "Standard";
    }
  }

  return {
    mode,
    language: ov?.language ?? globals.language,
    modelId: ov?.modelId ?? globals.modelId,
    style: rawStyle,
    temperature: ov?.temperature ?? globals.temperature,
  };
}

/** Settings hash for an effective (post-override) settings set — used to detect stale cached results. */
export function hashFor(eff: ReturnType<typeof effective>): string {
  return computeSettingsHash({
    modelId: eff.modelId,
    mode: eff.mode,
    language: eff.language,
    style: eff.style,
    temperature: eff.temperature,
  });
}

export function summarize(ai: PageAi): PageAiSummaryEntry {
  return {
    status: ai.status,
    hasResult: !!ai.result,
    isCustom: ai.isCustom,
    settingsHash: ai.settingsHash,
    updatedAt: ai.updatedAt,
  };
}

/** Notifies RightPanel that a page's AI content is fresh and ready to read aloud. */
export function dispatchPageReady(docId: string, pageNumber: number, result: string) {
  dispatchDocEvent("doclens:page-ready", { docId, pageNumber, result });
}
