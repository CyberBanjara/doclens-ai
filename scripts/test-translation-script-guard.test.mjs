import test from "node:test";
import assert from "node:assert/strict";

import {
  detectDominantScript,
  isContentScriptMismatch,
  getPageAiLanguageSlug,
} from "../src/lib/languageTableMap.ts";

// Real content returned by translations_hindi for a Hindi request (captured in production) —
// it is Bengali, which is exactly the contamination this guard must catch.
const BENGALI =
  "হরপ্পা সভ্যতার পতনের পরবর্তী দেড় হাজার বছরে ভারতীয় উপমহাদেশের বিভিন্ন অঞ্চলে বহু গুরুত্বপূর্ণ পরিবর্তন সূচিত হয়।";
const HINDI =
  "हड़प्पा सभ्यता के पतन के बाद के डेढ़ हज़ार वर्षों में भारतीय उपमहाद्वीप के विभिन्न क्षेत्रों में कई महत्वपूर्ण परिवर्तन हुए।";
const HINDI_WITH_ENGLISH =
  "Table 2.1: GDP (Gross Domestic Product) and NNP (Net National Product) figures for 1950-2020. " +
  "सकल घरेलू उत्पाद।";
const ENGLISH = "The decline of the Harappan civilisation was followed by many important changes.";

test("Translation script guard", async (t) => {
  await t.test("detects dominant scripts", () => {
    assert.equal(detectDominantScript(BENGALI), "bengali");
    assert.equal(detectDominantScript(HINDI), "devanagari");
    assert.equal(detectDominantScript(ENGLISH), "latin");
    assert.equal(detectDominantScript("12 34"), null);
  });

  await t.test("rejects Bengali content for Hindi and vice versa", () => {
    assert.equal(isContentScriptMismatch("हिंदी", BENGALI), true);
    assert.equal(isContentScriptMismatch("Hindi", BENGALI), true);
    assert.equal(isContentScriptMismatch("বাংলা", HINDI), true);
    assert.equal(isContentScriptMismatch("Bengali", HINDI), true);
  });

  await t.test("accepts content in the correct script", () => {
    assert.equal(isContentScriptMismatch("हिंदी", HINDI), false);
    assert.equal(isContentScriptMismatch("Marathi", HINDI), false); // same script, cannot tell
    assert.equal(isContentScriptMismatch("বাংলা", BENGALI), false);
    assert.equal(isContentScriptMismatch("English", ENGLISH), false);
  });

  await t.test("is conservative with Latin-heavy Indic pages and unknown languages", () => {
    assert.equal(isContentScriptMismatch("हिंदी", HINDI_WITH_ENGLISH), false);
    assert.equal(isContentScriptMismatch("हिंदी", ENGLISH), false);
    assert.equal(isContentScriptMismatch("Klingon", BENGALI), false);
    assert.equal(isContentScriptMismatch("English", BENGALI), true);
  });

  await t.test("resolves the language a cached page result was produced in", () => {
    assert.equal(getPageAiLanguageSlug({ language: "বাংলা" }), "bengali");
    assert.equal(getPageAiLanguageSlug({ settingsHash: "translate|हिंदी|Native|0.300" }), "hindi");
    assert.equal(
      getPageAiLanguageSlug({ language: "Telugu", settingsHash: "translate|हिंदी|Native|0.300" }),
      "telugu",
    );
    assert.equal(getPageAiLanguageSlug({}), null);
    assert.equal(getPageAiLanguageSlug(undefined), null);
  });
});
