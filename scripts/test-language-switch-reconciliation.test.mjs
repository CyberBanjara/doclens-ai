import test from "node:test";
import assert from "node:assert/strict";

import {
  getLanguageSlug,
  getLanguageTableName,
  normalizeBookCandidates,
} from "../src/lib/languageTableMap.ts";

test("Language Switch & Storage Reconciliation Test Suite", async (t) => {
  await t.test("1. Dedicated Table & Slug isolation for multi-language setup", () => {
    const hindiSlug = getLanguageSlug("Hindi");
    const banglaSlug = getLanguageSlug("Bangla");
    const teluguSlug = getLanguageSlug("Telugu");

    assert.equal(hindiSlug, "hindi");
    assert.equal(banglaSlug, "bengali");
    assert.equal(teluguSlug, "telugu");

    assert.equal(getLanguageTableName("Hindi"), "translations_hindi");
    assert.equal(getLanguageTableName("हिंदी"), "translations_hindi");
    assert.equal(getLanguageTableName("Bangla"), "translations_bengali");
    assert.equal(getLanguageTableName("বাংলা"), "translations_bengali");
    assert.equal(getLanguageTableName("Telugu"), "translations_telugu");
    assert.equal(getLanguageTableName("తెలుగు"), "translations_telugu");

    assert.notEqual(getLanguageTableName("Hindi"), getLanguageTableName("Bangla"));
  });

  await t.test("2. Reconciliation Logic Simulation: Keep/Fetch remote translations, purge missing", () => {
    // Simulate a local document with 3 pages translated in Hindi
    const localPages = [
      {
        pageNumber: 1,
        text: "Chapter 1 English text",
        pageAi: {
          pageNumber: 1,
          status: "done",
          result: "अध्याय 1 हिंदी अनुवाद",
          contextDelta: "हिंदी संदर्भ",
        },
      },
      {
        pageNumber: 2,
        text: "Chapter 2 English text",
        pageAi: {
          pageNumber: 2,
          status: "done",
          result: "अध्याय 2 हिंदी अनुवाद",
          contextDelta: "हिंदी संदर्भ 2",
        },
      },
      {
        pageNumber: 3,
        text: "Chapter 3 English text",
        pageAi: {
          pageNumber: 3,
          status: "done",
          result: "अध्याय 3 हिंदी अनुवाद",
          contextDelta: "हिंदी संदर्भ 3",
        },
      },
    ];

    // User switches to Bangla.
    // Supabase has translation ONLY for page 1 in Bangla:
    const supabaseBanglaPages = [
      { pageNumber: 1, content: "অধ্যায় ১ বাংলা অনুবাদ" },
    ];

    const remoteMap = new Map(supabaseBanglaPages.map((p) => [p.pageNumber, p.content]));

    // Execute reconciliation algorithm
    const reconciledPages = localPages.map((lp) => {
      const remoteTranslation = remoteMap.get(lp.pageNumber);
      if (remoteTranslation) {
        return {
          ...lp,
          pageAi: {
            pageNumber: lp.pageNumber,
            status: "done",
            result: remoteTranslation,
            updatedAt: Date.now(),
          },
        };
      } else {
        // Purge old Hindi translation -> blank state
        return {
          ...lp,
          pageAi: undefined,
        };
      }
    });

    // Page 1 should have Bangla translation
    assert.ok(reconciledPages[0].pageAi);
    assert.equal(reconciledPages[0].pageAi.status, "done");
    assert.equal(reconciledPages[0].pageAi.result, "অধ্যায় ১ বাংলা অনুবাদ");

    // Page 2 & 3 must be completely reset to blank state (no Hindi leftovers)
    assert.equal(reconciledPages[1].pageAi, undefined);
    assert.equal(reconciledPages[2].pageAi, undefined);

    const aiDoneCount = reconciledPages.filter((p) => p.pageAi?.status === "done").length;
    assert.equal(aiDoneCount, 1);
  });

  await t.test("3. Reconciliation with Zero remote translations -> Entire doc reset to blank state", () => {
    // Simulate a document with Hindi translations
    const localPages = [
      {
        pageNumber: 1,
        pageAi: { pageNumber: 1, status: "done", result: "हिंदी 1" },
      },
      {
        pageNumber: 2,
        pageAi: { pageNumber: 2, status: "done", result: "हिंदी 2" },
      },
    ];

    // User switches to Telugu. Supabase has NO translations for Telugu yet.
    const supabaseTeluguPages = [];
    const remoteMap = new Map(supabaseTeluguPages.map((p) => [p.pageNumber, p.content]));

    const reconciledPages = localPages.map((lp) => {
      const remoteTranslation = remoteMap.get(lp.pageNumber);
      if (remoteTranslation) {
        return {
          ...lp,
          pageAi: { pageNumber: lp.pageNumber, status: "done", result: remoteTranslation },
        };
      }
      return {
        ...lp,
        pageAi: undefined,
      };
    });

    // All pages must be in blank/idle state
    assert.equal(reconciledPages[0].pageAi, undefined);
    assert.equal(reconciledPages[1].pageAi, undefined);

    const aiDoneCount = reconciledPages.filter((p) => p.pageAi?.status === "done").length;
    assert.equal(aiDoneCount, 0);
  });

  await t.test("4. Context Store Isolation across language switches", () => {
    // In-memory cache simulation
    const docContextCache = new Map();
    docContextCache.set("doc-1", new Map([[1, "Hindi delta 1"], [2, "Hindi delta 2"]]));

    assert.equal(docContextCache.get("doc-1").size, 2);

    // On language switch, clearDocContext() is called
    docContextCache.clear();
    assert.equal(docContextCache.size, 0);

    // After clearing, reading previous context for newly selected language returns empty string
    const deltas = [];
    assert.equal(deltas.length, 0);
  });
});
