import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Provider Selection Architecture (Managed AI, Personal OpenRouter, OmniRouter)", () => {
  const openRouterTs = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/openrouter.ts"),
    "utf-8"
  );
  const omniRouterTs = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/omnirouter.ts"),
    "utf-8"
  );
  const pageAiTs = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/pageAi.ts"),
    "utf-8"
  );
  const runnerTs = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/pageTranslationRunner.ts"),
    "utf-8"
  );
  const settingsTsx = fs.readFileSync(
    path.resolve(process.cwd(), "src/routes/settings.tsx"),
    "utf-8"
  );
  const workstationTsx = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/PageWorkstation.tsx"),
    "utf-8"
  );

  it("1. Managed AI is the default provider and uses CURATED_MODELS", () => {
    // getAiProvider() returns "managed" by default
    assert.match(
      openRouterTs,
      /return\s+["']managed["'];/,
      "getAiProvider must default to 'managed'"
    );
    // CURATED_MODELS must be defined and exported
    assert.match(
      openRouterTs,
      /export\s+const\s+CURATED_MODELS:\s*ORModel\[\]/,
      "CURATED_MODELS must be exported in openrouter.ts"
    );
    // getEffectiveSelectedModel resolves CURATED_MODELS for managed
    assert.match(
      openRouterTs,
      /if\s*\(provider\s*===\s*["']managed["']\)\s*\{[\s\S]*CURATED_MODELS/,
      "getEffectiveSelectedModel must resolve CURATED_MODELS for managed provider"
    );
  });

  it("2. Managed AI routes requests through Vercel serverless layer for billing & quota", () => {
    // streamCompletion in openrouter.ts must call /api/translations/translate
    assert.match(
      openRouterTs,
      /\/api\/translations\/translate/,
      "streamCompletion must route through /api/translations/translate"
    );
    // Runner calls streamCompletion when provider is managed
    assert.match(
      runnerTs,
      /Managed AI \(default\)[\s\S]*streamCompletion/,
      "Runner must call streamCompletion for Managed AI"
    );
  });

  it("3. Personal OpenRouter sends requests directly to OpenRouter without managed billing", () => {
    // streamPersonalOpenRouterCompletion must be exported
    assert.match(
      openRouterTs,
      /export\s+async\s+function\s+streamPersonalOpenRouterCompletion/,
      "streamPersonalOpenRouterCompletion must be exported"
    );
    // It must connect directly to https://openrouter.ai/api/v1/chat/completions
    assert.match(
      openRouterTs,
      /https:\/\/openrouter\.ai\/api\/v1\/chat\/completions/,
      "Personal OpenRouter must connect directly to OpenRouter endpoint"
    );
    // Runner invokes streamPersonalOpenRouterCompletion for personal openrouter
    assert.match(
      runnerTs,
      /streamPersonalOpenRouterCompletion/,
      "Runner must invoke streamPersonalOpenRouterCompletion for personal OpenRouter"
    );
    // Personal OpenRouter requires personal API key
    assert.match(
      runnerTs,
      /Personal OpenRouter API key is not configured/,
      "Runner must require personal key for personal OpenRouter"
    );
  });

  it("4. OmniRouter connects directly to configured endpoint without managed quota", () => {
    // OmniRouter base URL & API key persistence
    assert.match(
      omniRouterTs,
      /doclens\.omnirouter\.baseUrl/,
      "OmniRouter base URL must persist in localStorage"
    );
    assert.match(
      omniRouterTs,
      /doclens\.omnirouter\.apiKey/,
      "OmniRouter API key must persist in localStorage"
    );
    // streamOmniRouterCompletion sends requests directly to baseUrl/chat/completions
    assert.match(
      omniRouterTs,
      /\$\{directBaseUrl\}\/chat\/completions/,
      "OmniRouter must stream completions from configured baseUrl"
    );
    // No automatic fallback to proxy or openrouter
    assert.doesNotMatch(
      omniRouterTs,
      /streamCompletion\(opts\)/,
      "streamOmniRouterCompletion must not fall back to managed streamCompletion"
    );
  });

  it("5. Authentication is strictly enforced across all providers", () => {
    // runnerTs checks getFreshAuthToken() for ALL modes
    assert.match(
      runnerTs,
      /const\s+authToken\s*=\s*await\s+getFreshAuthToken\(\);/,
      "Runner must check authentication token across all modes"
    );
    assert.match(
      runnerTs,
      /if\s*\(!authToken\)\s*\{[\s\S]*Authentication required/,
      "Runner must handle unauthenticated state across all providers"
    );
  });

  it("6. Universal usage logging without billing quota consumption for personal modes", () => {
    // runnerTs records local translation activity and increments translation counter for all modes
    assert.match(
      runnerTs,
      /apiIncrementTranslationCounter\(/,
      "Runner must increment usage tracking counter across all modes"
    );
    assert.match(
      runnerTs,
      /recordLocalTranslationActivity\(/,
      "Runner must record local activity across all modes"
    );
    // Only Managed AI uses /api/translations/translate which has quota reservation
    assert.doesNotMatch(
      openRouterTs,
      /streamPersonalOpenRouterCompletion[\s\S]*\/api\/translations\/translate/,
      "Personal OpenRouter must never call /api/translations/translate"
    );
  });

  it("7. Global Settings renders optional providers side by side without Managed AI as selectable option", () => {
    // Settings has ApiKeySection
    assert.match(
      settingsTsx,
      /<ApiKeySection/,
      "Settings must render ApiKeySection for OpenRouter"
    );
    // Settings has OmniRouterStatusSection
    assert.match(
      settingsTsx,
      /<OmniRouterStatusSection/,
      "Settings must render OmniRouterStatusSection for OmniRouter"
    );
    // OmniRouter component has "How to set up?" setup guide PDF download link
    const omniComponentTsx = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/settings/OmniRouterStatusSection.tsx"),
      "utf-8"
    );
    assert.match(
      omniComponentTsx,
      /omnirouter-setup-guide\.pdf/,
      "OmniRouter component must provide setup guide PDF download link"
    );
    // Workstation does not automatically fallback to OpenRouter when OmniRouter fails
    assert.doesNotMatch(
      workstationTsx,
      /setAiProvider\(["']openrouter["']\)/,
      "Workstation must not fall back to openrouter on omnirouter connection error"
    );
  });

  it("8. ON/OFF toggles replace Use buttons for OpenRouter and OmniRouter", () => {
    const apiKeySectionTsx = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/settings/ApiKeySection.tsx"),
      "utf-8"
    );
    const omniSectionTsx = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/settings/OmniRouterStatusSection.tsx"),
      "utf-8"
    );
    const currentSettingsTsx = fs.readFileSync(
      path.resolve(process.cwd(), "src/routes/settings.tsx"),
      "utf-8"
    );

    // Both sections have toggle switch (role="switch")
    assert.match(
      apiKeySectionTsx,
      /id=["']toggle-openrouter-switch["']/,
      "ApiKeySection must have a toggle switch for OpenRouter"
    );
    assert.match(
      apiKeySectionTsx,
      /id=["']toggle-openrouter-btn["']/,
      "ApiKeySection must have a toggle button for OpenRouter"
    );

    assert.match(
      omniSectionTsx,
      /id=["']toggle-omnirouter-switch["']/,
      "OmniRouterStatusSection must have a toggle switch for OmniRouter"
    );
    assert.match(
      omniSectionTsx,
      /id=["']toggle-omnirouter-btn["']/,
      "OmniRouterStatusSection must have a toggle button for OmniRouter"
    );

    // Settings provides mutual exclusivity and fallback to Managed AI
    assert.match(
      currentSettingsTsx,
      /handleToggleOpenRouter/,
      "Settings must implement handleToggleOpenRouter"
    );
    assert.match(
      currentSettingsTsx,
      /handleToggleOmniRouter/,
      "Settings must implement handleToggleOmniRouter"
    );
    assert.match(
      currentSettingsTsx,
      /setAiProvider\(["']managed["']\)/,
      "Toggling active provider OFF must revert to Managed AI"
    );
    assert.match(
      currentSettingsTsx,
      /id=["']active-ai-provider-badge["']/,
      "Settings must display active AI provider badge"
    );
  });

  it("9. ProviderModelSelectorModal categorizes models by provider and marks free models", () => {
    const modalTsx = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/settings/ProviderModelSelectorModal.tsx"),
      "utf-8"
    );
    const currentSettingsTsx = fs.readFileSync(
      path.resolve(process.cwd(), "src/routes/settings.tsx"),
      "utf-8"
    );

    // Modal categorizes providers (Google, Cloud, Entropy, Jedi, etc.)
    assert.match(
      modalTsx,
      /entropy:\s*["']Entropy["']/,
      "ProviderModelSelectorModal must categorize Entropy models"
    );
    assert.match(
      modalTsx,
      /jedi:\s*["']Jedi["']/,
      "ProviderModelSelectorModal must categorize Jedi models"
    );
    assert.match(
      modalTsx,
      /cloud:\s*["']Cloud["']/,
      "ProviderModelSelectorModal must categorize Cloud models"
    );
    assert.match(
      modalTsx,
      /google:\s*["']Google["']/,
      "ProviderModelSelectorModal must categorize Google models"
    );

    // Modal identifies free models
    assert.match(
      modalTsx,
      /function\s+isModelFree/,
      "ProviderModelSelectorModal must export isModelFree helper"
    );
    assert.match(
      modalTsx,
      /FREE/,
      "ProviderModelSelectorModal must render FREE badge for free models"
    );

    // Settings renders ProviderModelSelectorModal
    assert.match(
      currentSettingsTsx,
      /<ProviderModelSelectorModal/,
      "Settings must render ProviderModelSelectorModal"
    );
  });
});
