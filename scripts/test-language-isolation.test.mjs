import test from "node:test";
import assert from "node:assert/strict";

import {
  getLanguageSlug,
  getLanguageTableName,
  normalizeBookCandidates,
  getLanguageInfoFromSlug,
  SUPPORTED_TRANSLATION_SLUGS,
} from "../src/lib/languageTableMap.ts";

test("Language Table Mapping & Slugs", async (t) => {
  await t.test("should map native scripts and english names to correct slugs", () => {
    assert.equal(getLanguageSlug("Telugu"), "telugu");
    assert.equal(getLanguageSlug("తెలుగు"), "telugu");
    assert.equal(getLanguageSlug("Hindi"), "hindi");
    assert.equal(getLanguageSlug("हिंदी"), "hindi");
    assert.equal(getLanguageSlug("हिन्दी"), "hindi");
    assert.equal(getLanguageSlug("Bengali"), "bengali");
    assert.equal(getLanguageSlug("বাংলা"), "bengali");
    assert.equal(getLanguageSlug("Tamil"), "tamil");
    assert.equal(getLanguageSlug("தமிழ்"), "tamil");
  });

  await t.test("should resolve dedicated translation table names", () => {
    assert.equal(getLanguageTableName("Telugu"), "translations_telugu");
    assert.equal(getLanguageTableName("తెలుగు"), "translations_telugu");
    assert.equal(getLanguageTableName("Hindi"), "translations_hindi");
    assert.equal(getLanguageTableName("हिंदी"), "translations_hindi");
    assert.equal(getLanguageTableName("Bengali"), "translations_bengali");
    assert.equal(getLanguageTableName("বাংলা"), "translations_bengali");
  });

  await t.test("should ensure Telugu and Hindi table names are completely isolated", () => {
    const teluguTable = getLanguageTableName("Telugu");
    const hindiTable = getLanguageTableName("Hindi");
    assert.notEqual(teluguTable, hindiTable);
    assert.equal(teluguTable, "translations_telugu");
    assert.equal(hindiTable, "translations_hindi");
  });

  await t.test("should normalize book candidates consistently", () => {
    const { primaryId, candidateIds } = normalizeBookCandidates(
      "history/class-10/jess101.pdf",
      "doc-123",
    );
    assert.equal(primaryId, "jess101.pdf");
    assert.ok(candidateIds.includes("history/class-10/jess101.pdf"));
    assert.ok(candidateIds.includes("jess101.pdf"));
    assert.ok(candidateIds.includes("jess101"));
    assert.ok(candidateIds.includes("doc-123"));
  });

  await t.test("should properly compute sorted deduplicated pages array for book_languages", () => {
    const pageNumbers = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
    const uniqueSortedPages = Array.from(new Set(pageNumbers.filter((p) => p > 0))).sort(
      (a, b) => a - b,
    );
    assert.deepEqual(uniqueSortedPages, [1, 2, 3, 4, 5, 6, 9]);
    assert.equal(uniqueSortedPages.length, 7);
  });
});
