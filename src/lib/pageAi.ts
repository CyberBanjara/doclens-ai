import {
  computeSettingsHash,
  type PageAi,
  type PageAiSummaryEntry,
  type PageOverrides,
  type AiProvider,
} from "@/lib/storage";
import {
  TRANSLATION_STYLES,
  EXPLANATION_STYLES,
  type Globals,
  isOmniRouterConfigured,
  getOmniSelectedModel,
  getOmniDefaultModelSync,
} from "@/lib/openrouter";
import { dispatchDocEvent } from "@/lib/docEvents";
import { cleanAiText } from "./cleanAiText";

export { cleanAiText };

export function effective(globals: Globals, ov?: PageOverrides) {
  const rawProvider = ov?.provider ?? globals.provider ?? "omnirouter";
  const provider: AiProvider = rawProvider === "omnirouter" ? "omnirouter" : "openrouter";


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

  let defaultModelForProvider = globals.modelId;
  if (provider === "omnirouter") {
    defaultModelForProvider =
      globals.omniModelId || getOmniSelectedModel() || getOmniDefaultModelSync();
  }

  return {
    provider,
    mode,
    language: ov?.language ?? globals.language,
    modelId: ov?.modelId ?? defaultModelForProvider,
    style: rawStyle,
    temperature: ov?.temperature ?? globals.temperature,
  };
}

/** Settings hash for an effective (post-override) settings set — used to detect stale cached results. Excludes model & provider. */
export function hashFor(eff: ReturnType<typeof effective>): string {
  return computeSettingsHash({
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
