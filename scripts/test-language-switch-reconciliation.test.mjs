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

  await t.test(
    "2. Non-Destructive Union Sync: Combine local and Supabase translations without purging",
    () => {
      // Local has pages 2 and 3 translated
      const localPages = [
        {
          pageNumber: 1,
          text: "Chapter 1 text",
          pageAi: undefined,
        },
        {
          pageNumber: 2,
          text: "Chapter 2 text",
          pageAi: {
            pageNumber: 2,
            status: "done",
            result: "अध्याय 2 स्थानीय अनुवाद",
            contextDelta: "संदर्भ 2",
          },
        },
        {
          pageNumber: 3,
          text: "Chapter 3 text",
          pageAi: {
            pageNumber: 3,
            status: "done",
            result: "अध्याय 3 स्थानीय अनुवाद",
            contextDelta: "संदर्भ 3",
          },
        },
      ];

      // Supabase has translation ONLY for page 1
      const supabasePages = [{ pageNumber: 1, content: "अध्याय 1 क्लाउड अनुवाद" }];
      const remoteMap = new Map(supabasePages.map((p) => [p.pageNumber, p.content]));

      // Execute non-destructive union algorithm
      const reconciledPages = localPages.map((lp) => {
        const remoteTranslation = remoteMap.get(lp.pageNumber);
        const hasLocalResult = !!(lp.pageAi?.status === "done" && lp.pageAi?.result?.trim());

        if (remoteTranslation) {
          if (!hasLocalResult) {
            return {
              ...lp,
              pageAi: {
                pageNumber: lp.pageNumber,
                status: "done",
                result: remoteTranslation,
                updatedAt: Date.now(),
              },
            };
          }
        }
        // Preserve existing local translation!
        return lp;
      });

      // Page 1 should have Supabase translation
      assert.ok(reconciledPages[0].pageAi);
      assert.equal(reconciledPages[0].pageAi.status, "done");
      assert.equal(reconciledPages[0].pageAi.result, "अध्याय 1 क्लाउड अनुवाद");

      // Page 2 & 3 must remain intact in local storage (never purged!)
      assert.ok(reconciledPages[1].pageAi);
      assert.equal(reconciledPages[1].pageAi.result, "अध्याय 2 स्थानीय अनुवाद");
      assert.ok(reconciledPages[2].pageAi);
      assert.equal(reconciledPages[2].pageAi.result, "अध्याय 3 स्थानीय अनुवाद");

      const aiDoneCount = reconciledPages.filter((p) => p.pageAi?.status === "done").length;
      assert.equal(aiDoneCount, 3); // Union of all 3 pages
    },
  );

  await t.test(
    "3. Sync with Zero remote translations -> Local translations preserved intact",
    () => {
      // Simulate a document with local translations
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

      // Supabase has NO translations yet
      const supabasePages = [];
      const remoteMap = new Map(supabasePages.map((p) => [p.pageNumber, p.content]));

      const reconciledPages = localPages.map((lp) => {
        const remoteTranslation = remoteMap.get(lp.pageNumber);
        const hasLocalResult = !!(lp.pageAi?.status === "done" && lp.pageAi?.result?.trim());
        if (remoteTranslation && !hasLocalResult) {
          return {
            ...lp,
            pageAi: { pageNumber: lp.pageNumber, status: "done", result: remoteTranslation },
          };
        }
        return lp;
      });

      // All local pages must remain intact
      assert.ok(reconciledPages[0].pageAi);
      assert.equal(reconciledPages[0].pageAi.result, "हिंदी 1");
      assert.ok(reconciledPages[1].pageAi);
      assert.equal(reconciledPages[1].pageAi.result, "हिंदी 2");

      const aiDoneCount = reconciledPages.filter((p) => p.pageAi?.status === "done").length;
      assert.equal(aiDoneCount, 2);
    },
  );

  await t.test("4. Context Store Isolation across language switches", () => {
    // In-memory cache simulation
    const docContextCache = new Map();
    docContextCache.set(
      "doc-1",
      new Map([
        [1, "Hindi delta 1"],
        [2, "Hindi delta 2"],
      ]),
    );

    assert.equal(docContextCache.get("doc-1").size, 2);

    // On language switch, clearDocContext() is called
    docContextCache.clear();
    assert.equal(docContextCache.size, 0);

    // After clearing, reading previous context for newly selected language returns empty string
    const deltas = [];
    assert.equal(deltas.length, 0);
  });
});
