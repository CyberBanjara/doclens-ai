import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPagePayload,
  extractStreamingTranslation,
  parseStructuredTranslationResponse,
} from "../src/lib/openrouter.ts";

test("buildPagePayload creates schema-constrained structured prompt with previous context", () => {
  const previousContext =
    "--- PREVIOUS DOCUMENT CONTEXT & CONTINUITY ---\n[Page 1 Context]: Dr. Sharma -> डॉ. शर्मा; Quantum core -> क्वांटम कोर; Setting: Himalayan research facility.";
  const payload = buildPagePayload({
    modelId: "test/model",
    mode: "translate",
    language: "हिंदी",
    style: "Native",
    temperature: 0.3,
    pageNumber: 2,
    pageText: "Dr. Sharma activated the quantum core.",
    previousContext,
  });

  assert.equal(payload.model, "test/model");
  assert.equal(payload.stream, true);
  assert.deepEqual(payload.response_format, { type: "json_object" });

  const messages = payload.messages;
  assert.equal(messages.length, 2);

  // System message specifies structured output schema
  assert.match(messages[0].content, /"translation":/);
  assert.match(messages[0].content, /"context_delta":/);
  assert.match(messages[0].content, /STRUCTURED OUTPUT REQUIREMENT/);

  // User message incorporates previous context and current page
  assert.match(messages[1].content, /PREVIOUS DOCUMENT CONTEXT & CONTINUITY/);
  assert.match(messages[1].content, /Dr\. Sharma -> डॉ\. शर्मा/);
  assert.match(messages[1].content, /--- Page 2 ---/);
  assert.match(messages[1].content, /Dr\. Sharma activated the quantum core\./);
});

test("extractStreamingTranslation extracts in-progress translation smoothly without JSON leakage", () => {
  // Scenario A: Partial streaming start
  const chunk1 = '{\n  "translation": "डॉ. शर्मा ने';
  assert.equal(extractStreamingTranslation(chunk1), "डॉ. शर्मा ने");

  // Scenario B: Mid-stream with escaped quotes and newlines
  const chunk2 = '{\n  "translation": "डॉ. शर्मा ने \\"क्वांटम कोर\\" सक्रिय किया।\\nनई शुरुआत।"';
  assert.equal(
    extractStreamingTranslation(chunk2),
    'डॉ. शर्मा ने "क्वांटम कोर" सक्रिय किया।\nनई शुरुआत।',
  );

  // Scenario C: Completed JSON with context_delta
  const chunk3 =
    '{\n  "translation": "डॉ. शर्मा ने क्वांटम कोर सक्रिय किया।",\n  "context_delta": "Core online"\n}';
  assert.equal(extractStreamingTranslation(chunk3), "डॉ. शर्मा ने क्वांटम कोर सक्रिय किया।");

  // Scenario D: Plain text fallback streaming
  const plainChunk = "नमस्ते दुनिया";
  assert.equal(extractStreamingTranslation(plainChunk), "नमस्ते दुनिया");
});

test("parseStructuredTranslationResponse handles valid JSON, markdown codeblocks, and fallbacks", () => {
  // Case 1: Clean JSON
  const raw1 = JSON.stringify({
    translation: "यह एक अनुवाद है।",
    context_delta: "Terminology: अनुवाद = translation",
  });
  const res1 = parseStructuredTranslationResponse(raw1);
  assert.equal(res1.translation, "यह एक अनुवाद है।");
  assert.equal(res1.context_delta, "Terminology: अनुवाद = translation");

  // Case 2: Markdown fenced JSON
  const raw2 = "```json\n" + raw1 + "\n```";
  const res2 = parseStructuredTranslationResponse(raw2);
  assert.equal(res2.translation, "यह एक अनुवाद है।");
  assert.equal(res2.context_delta, "Terminology: अनुवाद = translation");

  // Case 3: Raw plain text without JSON (graceful fallback)
  const raw3 = "यह केवल साधारण पाठ है बिना किसी जेसन के।";
  const res3 = parseStructuredTranslationResponse(raw3);
  assert.equal(res3.translation, raw3);
  assert.equal(res3.context_delta, "");
});
