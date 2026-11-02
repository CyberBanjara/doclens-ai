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
  CURATED_MODELS,
  type Globals,
  isOmniRouterConfigured,
  getOmniSelectedModel,
  getOmniDefaultModelSync,
  getSelectedModel,
  getDefaultModelSync,
} from "@/lib/openrouter";
import { dispatchDocEvent } from "@/lib/docEvents";
import { cleanAiText } from "./cleanAiText";

export { cleanAiText };

export function effective(globals: Globals, ov?: PageOverrides) {
  const defaultProvider: AiProvider = "managed";
  const rawProvider = ov?.provider ?? globals.provider ?? defaultProvider;
  const provider: AiProvider =
    rawProvider === "ollama"
      ? "ollama"
      : rawProvider === "omnirouter"
        ? "omnirouter"
        : rawProvider === "openrouter"
          ? "openrouter"
          : "managed";

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

  let defaultModelForProvider = globals.modelId || getSelectedModel() || CURATED_MODELS[0]?.id || "liquid/lfm-2.5-2.6b:free";
  if (provider === "ollama") {
    defaultModelForProvider =
      globals.ollamaModelId ||
      (typeof window !== "undefined" ? localStorage.getItem("doclens.ollama.model") || "" : "");
  } else if (provider === "omnirouter") {
    defaultModelForProvider =
      globals.omniModelId || getOmniSelectedModel() || getOmniDefaultModelSync() || "auto/best-coding";
  } else if (provider === "openrouter") {
    defaultModelForProvider = globals.modelId || getSelectedModel() || getDefaultModelSync();
  } else {
    const sel = globals.modelId || getSelectedModel();
    defaultModelForProvider =
      sel && CURATED_MODELS.some((m) => m.id === sel)
        ? sel
        : CURATED_MODELS[0]?.id || "liquid/lfm-2.5-2.6b:free";
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
