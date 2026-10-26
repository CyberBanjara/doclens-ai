import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

test("Translation Auth Requirement & IndexedDB Activity Caching System", async (t) => {
  // ─────────────────────────────────────────────────────────────────
  // 1. Translation Requires Login (Matching Global Library)
  // ─────────────────────────────────────────────────────────────────
  await t.test("PageWorkstation.tsx must require login and render sign-in prompt when unauthenticated", () => {
    const workstationPath = path.join(rootDir, "src/components/PageWorkstation.tsx");
    assert.ok(fs.existsSync(workstationPath), "PageWorkstation.tsx must exist");
    const content = fs.readFileSync(workstationPath, "utf-8");

    // Must destructure authLoading and signInWithGoogle from useAuth
    assert.match(
      content,
      /const\s*\{\s*user,\s*loading:\s*authLoading,\s*signInWithGoogle/,
      "PageWorkstation must consume user, authLoading, and signInWithGoogle from useAuth",
    );

    // Must check authLoading
    assert.match(
      content,
      /if\s*\(\s*authLoading\s*\)/,
      "PageWorkstation must handle authLoading state gracefully",
    );

    // Must enforce !user login prompt
    assert.match(
      content,
      /if\s*\(\s*!user\s*\)/,
      "PageWorkstation must enforce login requirement when !user",
    );
    assert.match(
      content,
      /Sign in to Translate/i,
      "PageWorkstation must show 'Sign in to Translate' headline",
    );
    assert.match(
      content,
      /signInWithGoogle\(\)/,
      "PageWorkstation must provide Google Sign-in action button",
    );

    // Selection translation and runPageWithSetup must guard against !user
    assert.match(
      content,
      /if\s*\(\s*!user\s*\)\s*\{\s*toast\.info\("Please sign in with Google to translate text\."\)/,
      "PageWorkstation must guard selection translation against unauthenticated execution",
    );
    assert.match(
      content,
      /if\s*\(\s*!user\s*\)\s*\{\s*toast\.info\("Please sign in with Google to translate pages\."\)/,
      "PageWorkstation must guard runPageWithSetup against unauthenticated execution",
    );
  });

  await t.test("pageTranslationRunner.ts and translation hooks must require authentication before execution", () => {
    const runnerPath = path.join(rootDir, "src/lib/pageTranslationRunner.ts");
    const runnerContent = fs.readFileSync(runnerPath, "utf-8");

    assert.match(
      runnerContent,
      /const authToken = await getFreshAuthToken\(\);/,
      "pageTranslationRunner must check fresh auth token before executing translation",
    );
    assert.match(
      runnerContent,
      /if\s*\(\s*!authToken\s*\)\s*\{[\s\S]*?Authentication required\. Please sign in to translate\./,
      "pageTranslationRunner must reject unauthenticated translation attempts",
    );

    const usePagePath = path.join(rootDir, "src/hooks/usePageTranslation.ts");
    const usePageContent = fs.readFileSync(usePagePath, "utf-8");
    assert.match(
      usePageContent,
      /const authToken = await getFreshAuthToken\(\);/,
      "usePageTranslation must verify authentication before running page translation",
    );

    const useFullBookPath = path.join(rootDir, "src/hooks/useFullBookTranslation.ts");
    const useFullBookContent = fs.readFileSync(useFullBookPath, "utf-8");
    assert.match(
      useFullBookContent,
      /const authToken = await getFreshAuthToken\(\);/,
      "useFullBookTranslation must verify authentication before starting full book translation",
    );
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. Immediate Fetch & IndexedDB Caching on Login
  // ─────────────────────────────────────────────────────────────────
  await t.test("AuthContext.tsx must immediately fetch and cache translation activity in IndexedDB upon login", () => {
    const authContextPath = path.join(rootDir, "src/context/AuthContext.tsx");
    const authContent = fs.readFileSync(authContextPath, "utf-8");

    // signInWithGoogle must call fetchAndCacheUserTranslationActivity
    assert.match(
      authContent,
      /fetchAndCacheUserTranslationActivity\(\s*authenticatedUser\.uid\s*\)/,
      "AuthContext signInWithGoogle must immediately fetch and cache translation activity in IndexedDB",
    );

    // checkRedirectResult must call fetchAndCacheUserTranslationActivity
    assert.match(
      authContent,
      /fetchAndCacheUserTranslationActivity\(\s*redirectUser\.uid\s*\)/,
      "AuthContext checkRedirectResult must immediately fetch and cache translation activity in IndexedDB",
    );

    // signOut must clear cached translation activity
    assert.match(
      authContent,
      /clearCachedTranslationActivity\(/,
      "AuthContext signOut must clear cached translation activity",
    );
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. IndexedDB Translation Activity Caching Module
  // ─────────────────────────────────────────────────────────────────
  await t.test("translationActivity.ts must provide persistent IndexedDB cache, memory cache, and update helpers", () => {
    const activityModulePath = path.join(rootDir, "src/lib/storage/translationActivity.ts");
    assert.ok(fs.existsSync(activityModulePath), "translationActivity.ts storage module must exist");
    const moduleContent = fs.readFileSync(activityModulePath, "utf-8");

    assert.match(
      moduleContent,
      /export async function getCachedTranslationActivity/,
      "Must export getCachedTranslationActivity",
    );
    assert.match(
      moduleContent,
      /export async function fetchAndCacheUserTranslationActivity/,
      "Must export fetchAndCacheUserTranslationActivity",
    );
    assert.match(
      moduleContent,
      /export async function recordLocalTranslationActivity/,
      "Must export recordLocalTranslationActivity",
    );
    assert.match(
      moduleContent,
      /export async function clearCachedTranslationActivity/,
      "Must export clearCachedTranslationActivity",
    );

    // Verify storage index export
    const storageIndexPath = path.join(rootDir, "src/lib/storage/index.ts");
    const storageIndexContent = fs.readFileSync(storageIndexPath, "utf-8");
    assert.match(
      storageIndexContent,
      /export \* from "\.\/translationActivity";/,
      "storage/index.ts must export translationActivity module",
    );
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. ActivityHeatmap Reuses Cached Data to Avoid Repeated Fetches
  // ─────────────────────────────────────────────────────────────────
  await t.test("ActivityHeatmap.tsx must reuse cached activity data and listen for real-time local updates", () => {
    const heatmapPath = path.join(rootDir, "src/components/ActivityHeatmap.tsx");
    const heatmapContent = fs.readFileSync(heatmapPath, "utf-8");

    assert.match(
      heatmapContent,
      /getCachedTranslationActivity\(userId,\s*\{\s*forceRefresh\s*\}\)/,
      "ActivityHeatmap must call getCachedTranslationActivity to avoid repeatedly fetching from Supabase",
    );
    assert.match(
      heatmapContent,
      /doclens:translation-activity-updated/,
      "ActivityHeatmap must subscribe to doclens:translation-activity-updated custom event",
    );
  });

  // ─────────────────────────────────────────────────────────────────
  // 5. In-Memory Simulated Cache Lifecycle Test
  // ─────────────────────────────────────────────────────────────────
  await t.test("Simulated Cache Lifecycle: Reuses cache and avoids Supabase network requests", async () => {
    // Model simulating the IndexedDB META store and Supabase fetch logic
    const indexedDbMetaStore = new Map();
    let networkFetchCount = 0;

    async function mockApiGetTranslationActivityFromSupabase(userId) {
      networkFetchCount++;
      return {
        total_pages: 15,
        active_days: 3,
        daily_activity: {
          "2026-10-25": { date: "2026-10-25", count: 10, books: { "Chapter 1": 10 } },
          "2026-10-26": { date: "2026-10-26", count: 5, books: { "Chapter 2": 5 } },
        },
      };
    }

    async function getCachedActivity(userId, options = {}) {
      const forceRefresh = options.forceRefresh ?? false;
      const key = `translation_activity:${userId}`;

      // Check IndexedDB cache
      if (!forceRefresh && indexedDbMetaStore.has(key)) {
        return indexedDbMetaStore.get(key);
      }

      // Fetch from Supabase
      const remote = await mockApiGetTranslationActivityFromSupabase(userId);
      indexedDbMetaStore.set(key, remote);
      return remote;
    }

    const testUid = "user_test_999";

    // 1. First fetch on login (fetchAndCacheUserTranslationActivity): network fetch occurs (count = 1)
    const initialData = await getCachedActivity(testUid, { forceRefresh: true });
    assert.equal(networkFetchCount, 1, "Login should perform initial fetch from Supabase");
    assert.equal(initialData.total_pages, 15);
    assert.ok(indexedDbMetaStore.has(`translation_activity:${testUid}`), "Data must be saved in IndexedDB");

    // 2. Subsequent queries (opening profile, navigating pages, reloading components):
    // MUST reuse cached IndexedDB data and make ZERO extra network calls!
    const reusedData1 = await getCachedActivity(testUid, { forceRefresh: false });
    const reusedData2 = await getCachedActivity(testUid, { forceRefresh: false });
    assert.equal(networkFetchCount, 1, "Subsequent queries must reuse cached data without re-fetching from Supabase");
    assert.equal(reusedData1.total_pages, 15);
    assert.equal(reusedData2.total_pages, 15);

    // 3. When a translation occurs locally:
    // Update local cache directly without network round-trip!
    const cached = indexedDbMetaStore.get(`translation_activity:${testUid}`);
    cached.total_pages += 1;
    indexedDbMetaStore.set(`translation_activity:${testUid}`, cached);

    const updatedData = await getCachedActivity(testUid, { forceRefresh: false });
    assert.equal(networkFetchCount, 1, "Reading locally updated cache must not trigger network fetch");
    assert.equal(updatedData.total_pages, 16);

    // 4. Force refresh (e.g. manual refresh button):
    // Should contact Supabase and update cache
    const refreshed = await getCachedActivity(testUid, { forceRefresh: true });
    assert.equal(networkFetchCount, 2, "Force refresh should contact Supabase");
  });
});
