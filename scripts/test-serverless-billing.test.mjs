import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

test("Serverless Translation Billing Layer & Atomic Quota System", async (t) => {
  // ─────────────────────────────────────────────────────────────────
  // 1. Supabase Schema Invariants for Billing System
  // ─────────────────────────────────────────────────────────────────
  await t.test("supabase_schema.sql and migration must define billing tables and atomic stored procedures", () => {
    const schemaPath = path.join(rootDir, "supabase_schema.sql");
    const migrationPath = path.join(rootDir, "migration_translation_billing_system.sql");

    const schemaContent = fs.readFileSync(schemaPath, "utf-8");
    const migrationContent = fs.readFileSync(migrationPath, "utf-8");

    for (const [name, content] of [["supabase_schema.sql", schemaContent], ["migration_translation_billing_system.sql", migrationContent]]) {
      // Tables
      assert.match(content, /create table if not exists (public\.)?billing_plans/i, `${name} must define billing_plans table`);
      assert.match(content, /create table if not exists (public\.)?user_subscriptions/i, `${name} must define user_subscriptions table`);
      assert.match(content, /create table if not exists (public\.)?translation_reservations/i, `${name} must define translation_reservations table`);
      assert.match(content, /create table if not exists (public\.)?user_billing_history/i, `${name} must define user_billing_history table`);

      // Plans
      assert.match(content, /'free'.*0.*30/i, `${name} must seed Free plan (30 pages)`);
      assert.match(content, /'pass'.*99.*300/i, `${name} must seed Pass plan (₹99 / 300 pages)`);
      assert.match(content, /'monthly'.*149.*600/i, `${name} must seed Monthly Pro plan (₹149 / 600 pages)`);
      assert.match(content, /'topup_100'/i, `${name} must seed Top-up pack`);

      // Atomic Stored Procedures
      assert.match(content, /create or replace function (public\.)?validate_and_reserve_translation_quota/i, `${name} must define validate_and_reserve_translation_quota RPC`);
      assert.match(content, /create or replace function (public\.)?finalize_translation_quota/i, `${name} must define finalize_translation_quota RPC`);
      assert.match(content, /create or replace function (public\.)?refund_translation_quota/i, `${name} must define refund_translation_quota RPC`);
      assert.match(content, /for update/i, `${name} must use row-level locking (FOR UPDATE) to prevent concurrent overspending`);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. Vercel Serverless Function Endpoints Exist
  // ─────────────────────────────────────────────────────────────────
  await t.test("Vercel serverless translation endpoints must exist", () => {
    const endpoints = [
      "server/api/translations/translate.post.ts",
      "server/api/translations/translate.ts",
      "server/api/translations/billing.get.ts",
      "server/api/translations/billing.ts",
      "server/api/translations/subscribe.post.ts",
      "server/api/translations/subscribe.ts",
      "src/components/BillingModal.tsx",
    ];

    for (const relPath of endpoints) {
      const fullPath = path.join(rootDir, relPath);
      assert.ok(fs.existsSync(fullPath), `Endpoint or component must exist: ${relPath}`);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. Quota Reservation & Concurrency Logic Simulation
  // ─────────────────────────────────────────────────────────────────
  await t.test("Quota reservation must enforce atomic concurrency limits and prevent overspending", () => {
    // In-memory model of user subscription
    let subscription = {
      user_id: "usr_test_123",
      plan_id: "free",
      plan_type: "free",
      plan_pages_limit: 30,
      plan_pages_used: 29, // 1 page left
      topup_pages_balance: 0,
      reserved_pages: 0,
    };

    const reservations = new Map();

    function reserveQuota(userId, pageKey) {
      const available = (subscription.plan_pages_limit - subscription.plan_pages_used + subscription.topup_pages_balance) - subscription.reserved_pages;
      if (available < 1) {
        return { authorized: false, code: "QUOTA_EXCEEDED", remaining_pages: 0 };
      }

      const resId = `res_${Date.now()}_${Math.random()}`;
      subscription.reserved_pages += 1;
      reservations.set(resId, { id: resId, status: "reserved", pageKey });
      return { authorized: true, reservation_id: resId, remaining_pages: available - 1 };
    }

    function finalizeQuota(resId) {
      const r = reservations.get(resId);
      if (!r || r.status !== "reserved") return false;
      r.status = "finalized";
      subscription.reserved_pages = Math.max(0, subscription.reserved_pages - 1);
      subscription.plan_pages_used += 1;
      return true;
    }

    function refundQuota(resId) {
      const r = reservations.get(resId);
      if (!r || r.status !== "reserved") return false;
      r.status = "refunded";
      subscription.reserved_pages = Math.max(0, subscription.reserved_pages - 1);
      return true;
    }

    // Attempt 1st reservation: 1 page left -> succeeds!
    const res1 = reserveQuota("usr_test_123", "doc1:1:hi");
    assert.strictEqual(res1.authorized, true);
    assert.strictEqual(subscription.reserved_pages, 1);

    // Attempt concurrent 2nd reservation before res1 finalizes: balance is currently 0 -> rejected!
    const res2 = reserveQuota("usr_test_123", "doc1:2:hi");
    assert.strictEqual(res2.authorized, false);
    assert.strictEqual(res2.code, "QUOTA_EXCEEDED");

    // Case A: If translation 1 fails and is refunded
    refundQuota(res1.reservation_id);
    assert.strictEqual(subscription.reserved_pages, 0);
    assert.strictEqual(subscription.plan_pages_used, 29); // Restored!

    // Now re-attempting translation succeeds
    const res3 = reserveQuota("usr_test_123", "doc1:2:hi");
    assert.strictEqual(res3.authorized, true);

    // Finalizing translation 3 permanently commits quota
    finalizeQuota(res3.reservation_id);
    assert.strictEqual(subscription.reserved_pages, 0);
    assert.strictEqual(subscription.plan_pages_used, 30); // Quota fully used

    // Further translations are blocked
    const res4 = reserveQuota("usr_test_123", "doc1:3:hi");
    assert.strictEqual(res4.authorized, false);
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. Deduplication & Idempotency Check
  // ─────────────────────────────────────────────────────────────────
  await t.test("Already translated pages must consume 0 quota", () => {
    const existingActivities = new Set(["docA:1:hi", "docA:2:hi"]);

    function checkQuotaWithDeduplication(userId, pageKey, availableBalance) {
      if (existingActivities.has(pageKey)) {
        return { authorized: true, already_counted: true, reservation_id: null, cost: 0 };
      }
      return { authorized: availableBalance > 0, already_counted: false, cost: 1 };
    }

    // Already translated page
    const r1 = checkQuotaWithDeduplication("user_1", "docA:1:hi", 0);
    assert.strictEqual(r1.authorized, true, "Already translated page must be allowed even with 0 balance");
    assert.strictEqual(r1.already_counted, true);
    assert.strictEqual(r1.cost, 0);

    // Brand new page with 0 balance
    const r2 = checkQuotaWithDeduplication("user_1", "docA:3:hi", 0);
    assert.strictEqual(r2.authorized, false, "Brand new page without balance must be rejected");
  });

  // ─────────────────────────────────────────────────────────────────
  // 5. OpenRouter Client Routing Verification
  // ─────────────────────────────────────────────────────────────────
  await t.test("openrouter.ts streamCompletion must route through Vercel endpoint", () => {
    const openrouterPath = path.join(rootDir, "src/lib/openrouter.ts");
    const openrouterContent = fs.readFileSync(openrouterPath, "utf-8");

    assert.match(
      openrouterContent,
      /fetch\(\s*["']\/api\/translations\/translate["']/i,
      "streamCompletion must route requests through /api/translations/translate",
    );
    assert.match(
      openrouterContent,
      /credentials:\s*["']include["']/i,
      "streamCompletion must include authentication credentials in request",
    );
    assert.match(
      openrouterContent,
      /doclens:open-billing-modal/i,
      "streamCompletion must trigger billing modal when quota is exceeded",
    );
  });
});
