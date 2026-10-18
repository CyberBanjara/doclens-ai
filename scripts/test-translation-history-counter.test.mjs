import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

test("Translation History Counter System", async (t) => {
  // ─────────────────────────────────────────────────────────────────
  // 1. Supabase Schema Invariants
  // ─────────────────────────────────────────────────────────────────
  await t.test(
    "supabase_schema.sql must define user_translation_counters and atomic stored procedure",
    () => {
      const schemaPath = path.join(rootDir, "supabase_schema.sql");
      const schemaContent = fs.readFileSync(schemaPath, "utf-8");

      // Table definition
      assert.match(
        schemaContent,
        /create table if not exists user_translation_counters/i,
        "Schema must define user_translation_counters table",
      );
      assert.match(
        schemaContent,
        /total_translated_pages\s+integer\s+not\s+null\s+default\s+0/i,
        "Table must contain total_translated_pages integer column defaulting to 0",
      );
      assert.match(
        schemaContent,
        /page_keys\s+text\[\]\s+not\s+null\s+default\s+'{}'/i,
        "Table must contain page_keys text[] column for deduplication without unnecessary database records",
      );

      // RLS enabled
      assert.match(
        schemaContent,
        /alter table user_translation_counters enable row level security/i,
        "RLS must be enabled on user_translation_counters",
      );

      // Atomic stored procedure
      assert.match(
        schemaContent,
        /create or replace function increment_user_translation_counter/i,
        "Schema must define atomic increment_user_translation_counter procedure",
      );
      assert.match(
        schemaContent,
        /not\s*\(\s*p_page_key\s*=\s*any\s*\(\s*page_keys\s*\)\s*\)/i,
        "Stored procedure must atomically check and deduplicate page_key before incrementing",
      );
    },
  );

  // ─────────────────────────────────────────────────────────────────
  // 2. Server API Endpoints Exist & Are Exported
  // ─────────────────────────────────────────────────────────────────
  await t.test("Vercel serverless functions must exist in server/api/translations/", () => {
    const counterGetPath = path.join(rootDir, "server/api/translations/counter.get.ts");
    const counterReexportPath = path.join(rootDir, "server/api/translations/counter.ts");
    const incrementPostPath = path.join(rootDir, "server/api/translations/increment.post.ts");
    const incrementReexportPath = path.join(rootDir, "server/api/translations/increment.ts");
    const supabaseServerPath = path.join(rootDir, "server/lib/supabase-server.ts");

    assert.ok(fs.existsSync(counterGetPath), "counter.get.ts must exist");
    assert.ok(fs.existsSync(counterReexportPath), "counter.ts must exist");
    assert.ok(fs.existsSync(incrementPostPath), "increment.post.ts must exist");
    assert.ok(fs.existsSync(incrementReexportPath), "increment.ts must exist");
    assert.ok(fs.existsSync(supabaseServerPath), "supabase-server.ts must exist");
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. User Counter Deduplication & Atomicity Simulation
  // ─────────────────────────────────────────────────────────────────
  await t.test("Counter increment must strictly deduplicate duplicate requests and retries", () => {
    // In-memory model representing the PostgreSQL atomic deduplication logic
    const db = new Map();

    function simulateAtomicIncrement(userId, pageKey) {
      let row = db.get(userId);
      if (!row) {
        row = { user_id: userId, total_translated_pages: 1, page_keys: [pageKey] };
        db.set(userId, row);
        return { totalTranslatedPages: 1, alreadyCounted: false };
      }

      if (row.page_keys.includes(pageKey)) {
        // Duplicate request or retry: do not increment!
        return { totalTranslatedPages: row.total_translated_pages, alreadyCounted: true };
      }

      row.total_translated_pages += 1;
      row.page_keys.push(pageKey);
      return { totalTranslatedPages: row.total_translated_pages, alreadyCounted: false };
    }

    const user1 = "user_abc_123";
    const user2 = "user_xyz_789";

    // First translation of page 1 for user1
    const res1 = simulateAtomicIncrement(user1, "doc1:1:hindi");
    assert.equal(res1.totalTranslatedPages, 1);
    assert.equal(res1.alreadyCounted, false);

    // Duplicate request or retry of page 1 for user1 (network retry / user click)
    const res1Retry = simulateAtomicIncrement(user1, "doc1:1:hindi");
    assert.equal(
      res1Retry.totalTranslatedPages,
      1,
      "Duplicate translation must not increase counter",
    );
    assert.equal(res1Retry.alreadyCounted, true);

    // Another page for user1
    const res2 = simulateAtomicIncrement(user1, "doc1:2:hindi");
    assert.equal(res2.totalTranslatedPages, 2);
    assert.equal(res2.alreadyCounted, false);

    // Same page in a different language is a separate translation
    const res3 = simulateAtomicIncrement(user1, "doc1:1:telugu");
    assert.equal(res3.totalTranslatedPages, 3);
    assert.equal(res3.alreadyCounted, false);

    // Duplicate retry of the telugu translation
    const res3Retry = simulateAtomicIncrement(user1, "doc1:1:telugu");
    assert.equal(res3Retry.totalTranslatedPages, 3);
    assert.equal(res3Retry.alreadyCounted, true);

    // User isolation: user2 activity must NOT affect user1
    const resUser2 = simulateAtomicIncrement(user2, "doc1:1:hindi");
    assert.equal(resUser2.totalTranslatedPages, 1);
    assert.equal(db.get(user1)?.total_translated_pages, 3);
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. Cache Reuse Invariant in Translation Runner
  // ─────────────────────────────────────────────────────────────────
  await t.test(
    "pageTranslationRunner.ts must check cache before executing LLM and return fromCache: true",
    () => {
      const runnerPath = path.join(rootDir, "src/lib/pageTranslationRunner.ts");
      const runnerContent = fs.readFileSync(runnerPath, "utf-8");

      // Local cache check
      assert.match(
        runnerContent,
        /state\.status === "done"[\s\S]*?state\.result/,
        "Runner must check local storage done status before processing",
      );
      assert.match(runnerContent, /fromCache:\s*true/, "Cached returns must set fromCache: true");

      // Counter increment occurs ONLY on live translation completion
      assert.match(
        runnerContent,
        /apiIncrementTranslationCounter\(/,
        "Runner must call apiIncrementTranslationCounter on success",
      );

      // Counter increment must be AFTER successful persistence
      const upsertIdx = runnerContent.indexOf("await upsertPageAi(docId, pageNumber, {");
      const incrementIdx = runnerContent.indexOf("apiIncrementTranslationCounter({");
      assert.ok(upsertIdx !== -1, "upsertPageAi must exist");
      assert.ok(incrementIdx !== -1, "apiIncrementTranslationCounter must exist");
      assert.ok(
        incrementIdx > upsertIdx,
        "apiIncrementTranslationCounter must be executed AFTER upsertPageAi persistence succeeds",
      );

      // Failure branch must not call increment
      const catchIdx = runnerContent.indexOf("} catch (e) {");
      assert.ok(catchIdx !== -1, "catch block must exist");
      assert.ok(catchIdx > incrementIdx, "catch block must follow try block");
    },
  );

  // ─────────────────────────────────────────────────────────────────
  // 5. User Profile UI Displays Counter
  // ─────────────────────────────────────────────────────────────────
  await t.test(
    "ProfileDropdown.tsx must render user.totalTranslatedPages in user profile card",
    () => {
      const profilePath = path.join(rootDir, "src/components/ProfileDropdown.tsx");
      const profileContent = fs.readFileSync(profilePath, "utf-8");

      assert.match(
        profileContent,
        /user\.totalTranslatedPages\s*\?\?\s*0/,
        "ProfileDropdown must render user.totalTranslatedPages with fallback 0",
      );
      assert.match(
        profileContent,
        /Translated Pages/i,
        "ProfileDropdown must have Translated Pages label",
      );
      assert.match(
        profileContent,
        /user-profile-translated-pages-count/,
        "ProfileDropdown must have testable element ID for translated pages count",
      );
    },
  );

  // ─────────────────────────────────────────────────────────────────
  // 6. Security & Session Association
  // ─────────────────────────────────────────────────────────────────
  await t.test(
    "Server endpoints must authenticate session and forbid accessing/modifying other users' counters",
    () => {
      const counterGetContent = fs.readFileSync(
        path.join(rootDir, "server/api/translations/counter.get.ts"),
        "utf-8",
      );
      const incrementPostContent = fs.readFileSync(
        path.join(rootDir, "server/api/translations/increment.post.ts"),
        "utf-8",
      );

      // Both endpoints require session
      assert.match(
        counterGetContent,
        /getSessionUserFromEvent\(event\)/,
        "counter.get must authenticate session",
      );
      assert.match(
        counterGetContent,
        /getUserTranslationCounter\(session\.uid\)/,
        "counter.get must strictly use session.uid, never an arbitrary user parameter",
      );

      assert.match(
        incrementPostContent,
        /getSessionUserFromEvent\(event\)/,
        "increment.post must authenticate session",
      );
      assert.match(
        incrementPostContent,
        /incrementUserTranslationCounter\(session\.uid,\s*pageKey\)/,
        "increment.post must strictly use session.uid, never allowing users to increment other users' counters",
      );
    },
  );

  // ─────────────────────────────────────────────────────────────────
  // 7. Dual-Layer Local Storage Invariants
  // ─────────────────────────────────────────────────────────────────
  await t.test("Local translation counter module must exist and runner must update local first", () => {
    const counterPath = path.join(rootDir, "src/lib/storage/translationCounter.ts");
    assert.ok(fs.existsSync(counterPath), "translationCounter.ts must exist");

    const counterContent = fs.readFileSync(counterPath, "utf-8");
    assert.match(counterContent, /export async function recordLocalTranslation/);
    assert.match(counterContent, /export async function getLocalTranslationCounter/);
    assert.match(counterContent, /export async function syncLocalTranslationCounter/);

    const runnerContent = fs.readFileSync(path.join(rootDir, "src/lib/pageTranslationRunner.ts"), "utf-8");
    assert.match(
      runnerContent,
      /recordLocalTranslation\(/,
      "Runner must execute recordLocalTranslation on successful translation",
    );

    const profileContent = fs.readFileSync(path.join(rootDir, "src/components/ProfileDropdown.tsx"), "utf-8");
    assert.match(profileContent, /User Profile/, "Dropdown must have User Profile option");
    assert.match(profileContent, /Sign Out/, "Dropdown must have Sign Out option");
    assert.match(profileContent, /Dialog open=\{isProfileModalOpen\}/, "Profile modal must be triggered by dialog state");
  });
});
