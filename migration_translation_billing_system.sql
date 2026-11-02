-- ============================================================================
-- SQL MIGRATION: SECURE SERVERLESS TRANSLATION BILLING SYSTEM
-- ============================================================================
-- Feature: Configurable Plans, Quota Reservation, Safe Finalize/Refund, and Validity
-- Target: Supabase SQL Editor / PostgreSQL 14+
--
-- Plans Configured:
-- 1. Free: 30 pages / 30 days (auto-renews monthly)
-- 2. Pass: ₹99 / 300 pages / 30 days
-- 3. Monthly: ₹149 / 600 pages / 30 days
-- 4. Top-ups: Configurable top-up packs (e.g. ₹49/100 pages, ₹99/300 pages)
--
-- Safety & Performance Guarantees:
-- 1. Idempotent: Safe to execute repeatedly without dropping existing tables or data.
-- 2. Concurrency: Uses 'FOR UPDATE' row-level locks on user_subscriptions to prevent race conditions.
-- 3. Deduplication: Pages already translated for the user cost 0 quota (already_counted = true).
-- 4. Resilience: Unfinalized reservations older than 5 minutes auto-expire and release held quota.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLE: billing_plans
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price_inr INTEGER NOT NULL DEFAULT 0,
    pages_allotment INTEGER NOT NULL DEFAULT 30,
    validity_days INTEGER NOT NULL DEFAULT 30,
    plan_type TEXT NOT NULL DEFAULT 'free', -- 'free' | 'pass' | 'subscription' | 'topup'
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default configurable plans
INSERT INTO public.billing_plans (id, name, price_inr, pages_allotment, validity_days, plan_type, is_active)
VALUES
    ('free', 'Free Tier', 0, 30, 30, 'free', true),
    ('pass', 'Reader Pass', 99, 300, 30, 'pass', true),
    ('monthly', 'Monthly Pro', 149, 600, 30, 'subscription', true),
    ('topup_100', '100 Pages Top-up', 49, 100, 30, 'topup', true),
    ('topup_300', '300 Pages Top-up', 99, 300, 30, 'topup', true),
    ('topup_600', '600 Pages Top-up', 149, 600, 30, 'topup', true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    price_inr = EXCLUDED.price_inr,
    pages_allotment = EXCLUDED.pages_allotment,
    validity_days = EXCLUDED.validity_days,
    plan_type = EXCLUDED.plan_type,
    is_active = EXCLUDED.is_active,
    updated_at = now();

CREATE INDEX IF NOT EXISTS idx_billing_plans_active ON public.billing_plans (is_active, plan_type);


-- ----------------------------------------------------------------------------
-- 2. TABLE: user_subscriptions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    user_id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL DEFAULT 'free' REFERENCES public.billing_plans(id) ON UPDATE CASCADE,
    plan_type TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'expired' | 'canceled'
    period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
    plan_pages_limit INTEGER NOT NULL DEFAULT 30,
    plan_pages_used INTEGER NOT NULL DEFAULT 0,
    topup_pages_balance INTEGER NOT NULL DEFAULT 0,
    reserved_pages INTEGER NOT NULL DEFAULT 0,
    lifetime_pages_used INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON public.user_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_period ON public.user_subscriptions (period_end);


-- ----------------------------------------------------------------------------
-- 3. TABLE: translation_reservations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.translation_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    page_key TEXT NOT NULL,
    doc_id TEXT,
    book_id TEXT,
    book_title TEXT DEFAULT 'Untitled Document',
    page_number INTEGER NOT NULL,
    language TEXT NOT NULL DEFAULT 'default',
    pages INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'reserved', -- 'reserved' | 'finalized' | 'refunded'
    quota_source TEXT NOT NULL DEFAULT 'plan', -- 'free' | 'plan' | 'topup' | 'cached'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalized_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    refund_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_translation_reservations_user ON public.translation_reservations (user_id);
CREATE INDEX IF NOT EXISTS idx_translation_reservations_status ON public.translation_reservations (status);
CREATE INDEX IF NOT EXISTS idx_translation_reservations_created ON public.translation_reservations (created_at);
CREATE INDEX IF NOT EXISTS idx_translation_reservations_page_key ON public.translation_reservations (user_id, page_key);


-- ----------------------------------------------------------------------------
-- 4. TABLE: user_billing_history
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_billing_history (
    id TEXT PRIMARY KEY DEFAULT ('ord_' || replace(gen_random_uuid()::text, '-', '')),
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL REFERENCES public.billing_plans(id) ON UPDATE CASCADE,
    amount INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'INR',
    pages_credited INTEGER NOT NULL DEFAULT 0,
    validity_days INTEGER NOT NULL DEFAULT 30,
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    status TEXT NOT NULL DEFAULT 'paid', -- 'paid' | 'pending' | 'failed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_billing_history_user ON public.user_billing_history (user_id, created_at DESC);


-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translation_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_billing_history ENABLE ROW LEVEL SECURITY;

-- billing_plans: public read, service_role full
DROP POLICY IF EXISTS "Allow public read on active billing plans" ON public.billing_plans;
CREATE POLICY "Allow public read on active billing plans" ON public.billing_plans
    FOR SELECT TO anon, authenticated, service_role USING (is_active = true);

DROP POLICY IF EXISTS "Allow service_role full access on billing_plans" ON public.billing_plans;
CREATE POLICY "Allow service_role full access on billing_plans" ON public.billing_plans
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- user_subscriptions: user read own, service_role full
DROP POLICY IF EXISTS "Allow users to read their own subscription" ON public.user_subscriptions;
CREATE POLICY "Allow users to read their own subscription" ON public.user_subscriptions
    FOR SELECT TO authenticated USING (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "Allow service_role full access on user_subscriptions" ON public.user_subscriptions;
CREATE POLICY "Allow service_role full access on user_subscriptions" ON public.user_subscriptions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- translation_reservations: user read own, service_role full
DROP POLICY IF EXISTS "Allow users to read their own reservations" ON public.translation_reservations;
CREATE POLICY "Allow users to read their own reservations" ON public.translation_reservations
    FOR SELECT TO authenticated USING (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "Allow service_role full access on translation_reservations" ON public.translation_reservations;
CREATE POLICY "Allow service_role full access on translation_reservations" ON public.translation_reservations
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- user_billing_history: user read own, service_role full
DROP POLICY IF EXISTS "Allow users to read their own billing history" ON public.user_billing_history;
CREATE POLICY "Allow users to read their own billing history" ON public.user_billing_history
    FOR SELECT TO authenticated USING (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "Allow service_role full access on user_billing_history" ON public.user_billing_history;
CREATE POLICY "Allow service_role full access on user_billing_history" ON public.user_billing_history
    FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ----------------------------------------------------------------------------
-- 6. STORED PROCEDURE: validate_and_reserve_translation_quota
-- ----------------------------------------------------------------------------
-- Single atomic RPC for quota check & reservation with row locking.
CREATE OR REPLACE FUNCTION public.validate_and_reserve_translation_quota(
    p_user_id TEXT,
    p_doc_id TEXT,
    p_page_number INTEGER,
    p_language TEXT,
    p_page_key TEXT,
    p_book_title TEXT DEFAULT 'Untitled Document',
    p_book_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_user_id TEXT;
    v_clean_page_key TEXT;
    v_already_counted BOOLEAN := false;
    v_sub public.user_subscriptions%ROWTYPE;
    v_plan_available INTEGER;
    v_total_available INTEGER;
    v_reservation_id UUID;
    v_quota_source TEXT := 'plan';
    v_now TIMESTAMPTZ := now();
BEGIN
    v_clean_user_id := TRIM(COALESCE(p_user_id, ''));
    IF v_clean_user_id = '' THEN
        RETURN jsonb_build_object(
            'authorized', false,
            'code', 'UNAUTHORIZED',
            'error', 'Valid user_id required for quota validation'
        );
    END IF;

    v_clean_page_key := TRIM(COALESCE(p_page_key, ''));
    IF v_clean_page_key = '' THEN
        v_clean_page_key := COALESCE(p_book_id, p_doc_id, 'doc') || ':' || p_page_number || ':' || LOWER(COALESCE(p_language, 'default'));
    END IF;

    -- 1. Check if page is already translated and counted for this user (deduplication)
    IF EXISTS (
        SELECT 1 FROM public.user_translation_activities
        WHERE user_id = v_clean_user_id AND page_key = v_clean_page_key
    ) THEN
        v_already_counted := true;
    ELSIF EXISTS (
        SELECT 1 FROM public.user_translation_counters
        WHERE user_id = v_clean_user_id AND v_clean_page_key = ANY(page_keys)
    ) THEN
        v_already_counted := true;
    END IF;

    -- If already counted, translation costs 0 pages and is immediately authorized
    IF v_already_counted THEN
        SELECT * INTO v_sub FROM public.user_subscriptions WHERE user_id = v_clean_user_id;
        v_plan_available := GREATEST(0, COALESCE(v_sub.plan_pages_limit, 30) - COALESCE(v_sub.plan_pages_used, 0));
        v_total_available := v_plan_available + COALESCE(v_sub.topup_pages_balance, 0) - COALESCE(v_sub.reserved_pages, 0);

        RETURN jsonb_build_object(
            'authorized', true,
            'already_counted', true,
            'reservation_id', null,
            'remaining_pages', GREATEST(0, v_total_available),
            'plan', COALESCE(v_sub.plan_id, 'free'),
            'message', 'Page already translated for this account (0 quota consumed)'
        );
    END IF;

    -- 2. Lock user subscription row for atomic update
    SELECT * INTO v_sub
    FROM public.user_subscriptions
    WHERE user_id = v_clean_user_id
    FOR UPDATE;

    -- If user does not have a subscription row yet, initialize with default Free plan (30 pages / 30 days)
    IF NOT FOUND THEN
        INSERT INTO public.user_subscriptions (
            user_id, plan_id, plan_type, status, period_start, period_end,
            plan_pages_limit, plan_pages_used, topup_pages_balance, reserved_pages, lifetime_pages_used, updated_at
        ) VALUES (
            v_clean_user_id, 'free', 'free', 'active', v_now, v_now + interval '30 days',
            30, 0, 0, 0, 0, v_now
        )
        RETURNING * INTO v_sub;
    END IF;

    -- 3. Release any stale reservations older than 5 minutes to prevent stuck reserved counts
    UPDATE public.translation_reservations
    SET status = 'refunded', refunded_at = v_now, refund_reason = 'reservation_timeout_auto_release'
    WHERE user_id = v_clean_user_id AND status = 'reserved' AND created_at < (v_now - interval '5 minutes');

    -- Re-sync reserved_pages counter
    SELECT COUNT(*) INTO v_sub.reserved_pages
    FROM public.translation_reservations
    WHERE user_id = v_clean_user_id AND status = 'reserved';

    -- 4. Period validity / rollover handling
    IF v_now > v_sub.period_end THEN
        IF v_sub.plan_type = 'free' THEN
            -- Free tier rolls over to fresh 30 pages for the next 30 days
            v_sub.period_start := v_now;
            v_sub.period_end := v_now + interval '30 days';
            v_sub.plan_pages_used := 0;
            v_sub.plan_pages_limit := 30;
        ELSE
            -- Paid plan (pass / subscription) has expired: downgrade back to Free tier
            v_sub.plan_id := 'free';
            v_sub.plan_type := 'free';
            v_sub.status := 'active';
            v_sub.period_start := v_now;
            v_sub.period_end := v_now + interval '30 days';
            v_sub.plan_pages_used := 0;
            v_sub.plan_pages_limit := 30;
        END IF;
    END IF;

    -- 5. Calculate available balance
    v_plan_available := GREATEST(0, v_sub.plan_pages_limit - v_sub.plan_pages_used);
    v_total_available := (v_plan_available + v_sub.topup_pages_balance) - v_sub.reserved_pages;

    -- 6. Quota check
    IF v_total_available < 1 THEN
        -- Persist any rollover changes
        UPDATE public.user_subscriptions
        SET
            plan_id = v_sub.plan_id,
            plan_type = v_sub.plan_type,
            status = v_sub.status,
            period_start = v_sub.period_start,
            period_end = v_sub.period_end,
            plan_pages_limit = v_sub.plan_pages_limit,
            plan_pages_used = v_sub.plan_pages_used,
            reserved_pages = v_sub.reserved_pages,
            updated_at = v_now
        WHERE user_id = v_clean_user_id;

        RETURN jsonb_build_object(
            'authorized', false,
            'code', 'QUOTA_EXCEEDED',
            'error', 'Translation quota exceeded. Upgrade to Reader Pass (300 pages) or Monthly Pro (600 pages).',
            'remaining_pages', 0,
            'plan', v_sub.plan_id,
            'period_end', v_sub.period_end
        );
    END IF;

    -- 7. Determine quota source: use plan quota first, then topup balance
    IF (v_plan_available - v_sub.reserved_pages) >= 1 THEN
        v_quota_source := CASE WHEN v_sub.plan_id = 'free' THEN 'free' ELSE 'plan' END;
    ELSE
        v_quota_source := 'topup';
    END IF;

    -- 8. Atomically reserve 1 page
    v_reservation_id := gen_random_uuid();
    v_sub.reserved_pages := v_sub.reserved_pages + 1;

    INSERT INTO public.translation_reservations (
        id, user_id, page_key, doc_id, book_id, book_title, page_number, language, pages, status, quota_source, created_at
    ) VALUES (
        v_reservation_id, v_clean_user_id, v_clean_page_key, p_doc_id, p_book_id,
        COALESCE(NULLIF(TRIM(p_book_title), ''), 'Untitled Document'),
        p_page_number, COALESCE(NULLIF(TRIM(p_language), ''), 'default'),
        1, 'reserved', v_quota_source, v_now
    );

    UPDATE public.user_subscriptions
    SET
        plan_id = v_sub.plan_id,
        plan_type = v_sub.plan_type,
        status = v_sub.status,
        period_start = v_sub.period_start,
        period_end = v_sub.period_end,
        plan_pages_limit = v_sub.plan_pages_limit,
        plan_pages_used = v_sub.plan_pages_used,
        reserved_pages = v_sub.reserved_pages,
        updated_at = v_now
    WHERE user_id = v_clean_user_id;

    RETURN jsonb_build_object(
        'authorized', true,
        'already_counted', false,
        'reservation_id', v_reservation_id,
        'remaining_pages', v_total_available - 1,
        'plan', v_sub.plan_id,
        'quota_source', v_quota_source,
        'valid_until', v_sub.period_end
    );
END;
$$;


-- ----------------------------------------------------------------------------
-- 7. STORED PROCEDURE: finalize_translation_quota
-- ----------------------------------------------------------------------------
-- Called when translation stream successfully finishes: decrements reserved_pages,
-- deducts from plan_pages_used or topup_pages_balance, records activity, updates counters.
CREATE OR REPLACE FUNCTION public.finalize_translation_quota(
    p_reservation_id UUID,
    p_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_res public.translation_reservations%ROWTYPE;
    v_sub public.user_subscriptions%ROWTYPE;
    v_now TIMESTAMPTZ := now();
    v_total_available INTEGER;
BEGIN
    -- 1. Find and lock reservation
    SELECT * INTO v_res
    FROM public.translation_reservations
    WHERE id = p_reservation_id AND user_id = p_user_id AND status = 'reserved'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Reservation not found or already finalized/refunded'
        );
    END IF;

    -- 2. Lock user subscription
    SELECT * INTO v_sub
    FROM public.user_subscriptions
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Decrement in-flight reserved counter
    v_sub.reserved_pages := GREATEST(0, v_sub.reserved_pages - 1);

    -- Deduct actual page quota
    IF v_res.quota_source = 'topup' THEN
        v_sub.topup_pages_balance := GREATEST(0, v_sub.topup_pages_balance - 1);
    ELSE
        v_sub.plan_pages_used := v_sub.plan_pages_used + 1;
    END IF;

    v_sub.lifetime_pages_used := v_sub.lifetime_pages_used + 1;

    -- Update reservation status
    UPDATE public.translation_reservations
    SET status = 'finalized', finalized_at = v_now
    WHERE id = p_reservation_id;

    -- Update subscription balance
    UPDATE public.user_subscriptions
    SET
        plan_pages_used = v_sub.plan_pages_used,
        topup_pages_balance = v_sub.topup_pages_balance,
        reserved_pages = v_sub.reserved_pages,
        lifetime_pages_used = v_sub.lifetime_pages_used,
        updated_at = v_now
    WHERE user_id = p_user_id;

    -- 3. Atomically record into user_translation_activities and user_translation_counters
    -- This keeps existing translation heatmaps and counters 100% synchronized!
    INSERT INTO public.user_translation_activities (
        user_id, book_id, book_title, doc_id, page_number, language, page_key, translated_at, translated_date
    ) VALUES (
        p_user_id,
        COALESCE(v_res.book_id, v_res.doc_id, 'doc'),
        COALESCE(v_res.book_title, 'Untitled Document'),
        v_res.doc_id,
        v_res.page_number,
        v_res.language,
        v_res.page_key,
        v_now,
        (v_now AT TIME ZONE 'utc')::DATE
    )
    ON CONFLICT (user_id, page_key) DO NOTHING;

    INSERT INTO public.user_translation_counters (user_id, total_translated_pages, page_keys, created_at, updated_at)
    VALUES (p_user_id, 0, '{}', v_now, v_now)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.user_translation_counters
    SET
        total_translated_pages = total_translated_pages + 1,
        page_keys = array_append(page_keys, v_res.page_key),
        updated_at = v_now
    WHERE user_id = p_user_id
      AND NOT (v_res.page_key = ANY(page_keys));

    v_total_available := (GREATEST(0, v_sub.plan_pages_limit - v_sub.plan_pages_used) + v_sub.topup_pages_balance) - v_sub.reserved_pages;

    RETURN jsonb_build_object(
        'success', true,
        'finalized', true,
        'remaining_pages', GREATEST(0, v_total_available),
        'plan_pages_used', v_sub.plan_pages_used,
        'topup_balance', v_sub.topup_pages_balance
    );
END;
$$;


-- ----------------------------------------------------------------------------
-- 8. STORED PROCEDURE: refund_translation_quota
-- ----------------------------------------------------------------------------
-- Called when translation stream fails, errors, or aborts: releases reservation
-- so the user is never charged for failed translations.
CREATE OR REPLACE FUNCTION public.refund_translation_quota(
    p_reservation_id UUID,
    p_user_id TEXT,
    p_reason TEXT DEFAULT 'translation_failed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_res public.translation_reservations%ROWTYPE;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT * INTO v_res
    FROM public.translation_reservations
    WHERE id = p_reservation_id AND user_id = p_user_id AND status = 'reserved'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Reservation not found or already finalized/refunded'
        );
    END IF;

    -- Update reservation to refunded
    UPDATE public.translation_reservations
    SET status = 'refunded', refunded_at = v_now, refund_reason = p_reason
    WHERE id = p_reservation_id;

    -- Release reserved_pages in subscription
    UPDATE public.user_subscriptions
    SET
        reserved_pages = GREATEST(0, reserved_pages - 1),
        updated_at = v_now
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'refunded', true,
        'reason', p_reason
    );
END;
$$;


-- ----------------------------------------------------------------------------
-- 9. STORED PROCEDURE: get_user_billing_profile
-- ----------------------------------------------------------------------------
-- Comprehensive single-roundtrip query for UI: current plan, quotas, validity,
-- available plans, and recent usage history.
CREATE OR REPLACE FUNCTION public.get_user_billing_profile(
    p_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_user_id TEXT;
    v_sub public.user_subscriptions%ROWTYPE;
    v_plans JSONB;
    v_recent_usage JSONB;
    v_history JSONB;
    v_plan_available INTEGER;
    v_total_available INTEGER;
    v_days_left INTEGER;
    v_now TIMESTAMPTZ := now();
BEGIN
    v_clean_user_id := TRIM(COALESCE(p_user_id, ''));

    -- 1. Ensure user row exists
    SELECT * INTO v_sub FROM public.user_subscriptions WHERE user_id = v_clean_user_id;
    IF NOT FOUND THEN
        INSERT INTO public.user_subscriptions (
            user_id, plan_id, plan_type, status, period_start, period_end,
            plan_pages_limit, plan_pages_used, topup_pages_balance, reserved_pages, lifetime_pages_used, updated_at
        ) VALUES (
            v_clean_user_id, 'free', 'free', 'active', v_now, v_now + interval '30 days',
            30, 0, 0, 0, 0, v_now
        )
        RETURNING * INTO v_sub;
    END IF;

    -- 2. Period validity check
    IF v_now > v_sub.period_end THEN
        IF v_sub.plan_type = 'free' THEN
            v_sub.period_start := v_now;
            v_sub.period_end := v_now + interval '30 days';
            v_sub.plan_pages_used := 0;
            v_sub.plan_pages_limit := 30;
        ELSE
            v_sub.plan_id := 'free';
            v_sub.plan_type := 'free';
            v_sub.status := 'active';
            v_sub.period_start := v_now;
            v_sub.period_end := v_now + interval '30 days';
            v_sub.plan_pages_used := 0;
            v_sub.plan_pages_limit := 30;
        END IF;

        UPDATE public.user_subscriptions
        SET
            plan_id = v_sub.plan_id,
            plan_type = v_sub.plan_type,
            status = v_sub.status,
            period_start = v_sub.period_start,
            period_end = v_sub.period_end,
            plan_pages_limit = v_sub.plan_pages_limit,
            plan_pages_used = v_sub.plan_pages_used,
            updated_at = v_now
        WHERE user_id = v_clean_user_id;
    END IF;

    -- 3. Calculate metrics
    v_plan_available := GREATEST(0, v_sub.plan_pages_limit - v_sub.plan_pages_used);
    v_total_available := (v_plan_available + v_sub.topup_pages_balance) - v_sub.reserved_pages;
    v_days_left := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_sub.period_end - v_now)) / 86400.0)::INTEGER);

    -- 4. Active plans
    SELECT jsonb_agg(to_jsonb(p) ORDER BY p.price_inr ASC)
    INTO v_plans
    FROM public.billing_plans p
    WHERE p.is_active = true;

    -- 5. Recent reservations (last 30 items)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', r.id,
            'book_title', r.book_title,
            'page_number', r.page_number,
            'language', r.language,
            'status', r.status,
            'pages', r.pages,
            'quota_source', r.quota_source,
            'created_at', r.created_at,
            'finalized_at', r.finalized_at
        ) ORDER BY r.created_at DESC
    ), '[]'::jsonb)
    INTO v_recent_usage
    FROM (
        SELECT * FROM public.translation_reservations
        WHERE user_id = v_clean_user_id
        ORDER BY created_at DESC
        LIMIT 30
    ) r;

    -- 6. Billing purchase history (last 10 items)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', h.id,
            'plan_id', h.plan_id,
            'amount', h.amount,
            'currency', h.currency,
            'pages_credited', h.pages_credited,
            'validity_days', h.validity_days,
            'status', h.status,
            'created_at', h.created_at
        ) ORDER BY h.created_at DESC
    ), '[]'::jsonb)
    INTO v_history
    FROM (
        SELECT * FROM public.user_billing_history
        WHERE user_id = v_clean_user_id
        ORDER BY created_at DESC
        LIMIT 10
    ) h;

    RETURN jsonb_build_object(
        'subscription', jsonb_build_object(
            'plan_id', v_sub.plan_id,
            'plan_type', v_sub.plan_type,
            'status', v_sub.status,
            'period_start', v_sub.period_start,
            'period_end', v_sub.period_end,
            'days_remaining', v_days_left,
            'plan_pages_limit', v_sub.plan_pages_limit,
            'plan_pages_used', v_sub.plan_pages_used,
            'topup_pages_balance', v_sub.topup_pages_balance,
            'reserved_pages', v_sub.reserved_pages,
            'available_pages', GREATEST(0, v_total_available),
            'lifetime_pages_used', v_sub.lifetime_pages_used
        ),
        'available_plans', COALESCE(v_plans, '[]'::jsonb),
        'recent_usage', v_recent_usage,
        'billing_history', v_history
    );
END;
$$;


-- ----------------------------------------------------------------------------
-- 10. STORED PROCEDURE: purchase_or_topup_plan
-- ----------------------------------------------------------------------------
-- Handles purchasing Pass, Monthly Pro, or Top-up packs after verified payment.
CREATE OR REPLACE FUNCTION public.purchase_or_topup_plan(
    p_user_id TEXT,
    p_plan_id TEXT,
    p_razorpay_order_id TEXT DEFAULT NULL,
    p_razorpay_payment_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_user_id TEXT;
    v_plan public.billing_plans%ROWTYPE;
    v_sub public.user_subscriptions%ROWTYPE;
    v_now TIMESTAMPTZ := now();
    v_new_period_end TIMESTAMPTZ;
BEGIN
    v_clean_user_id := TRIM(COALESCE(p_user_id, ''));

    -- Find target plan
    SELECT * INTO v_plan FROM public.billing_plans WHERE id = p_plan_id AND is_active = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or inactive plan');
    END IF;

    -- Lock subscription
    SELECT * INTO v_sub FROM public.user_subscriptions WHERE user_id = v_clean_user_id FOR UPDATE;
    IF NOT FOUND THEN
        INSERT INTO public.user_subscriptions (
            user_id, plan_id, plan_type, status, period_start, period_end,
            plan_pages_limit, plan_pages_used, topup_pages_balance, reserved_pages, lifetime_pages_used, updated_at
        ) VALUES (
            v_clean_user_id, 'free', 'free', 'active', v_now, v_now + interval '30 days',
            30, 0, 0, 0, 0, v_now
        )
        RETURNING * INTO v_sub;
    END IF;

    IF v_plan.plan_type = 'topup' THEN
        -- Top-up pack: credit pages directly to topup balance
        v_sub.topup_pages_balance := v_sub.topup_pages_balance + v_plan.pages_allotment;
        IF v_sub.period_end < v_now THEN
            v_sub.period_end := v_now + (v_plan.validity_days || ' days')::interval;
        END IF;
    ELSE
        -- Tier upgrade or renewal (Pass or Monthly)
        v_sub.plan_id := v_plan.id;
        v_sub.plan_type := v_plan.plan_type;
        v_sub.status := 'active';
        v_sub.plan_pages_limit := v_plan.pages_allotment;
        v_sub.plan_pages_used := 0;
        v_sub.period_start := v_now;

        -- If existing subscription is still active, extend by validity_days; otherwise set from now
        IF v_sub.period_end > v_now THEN
            v_sub.period_end := v_sub.period_end + (v_plan.validity_days || ' days')::interval;
        ELSE
            v_sub.period_end := v_now + (v_plan.validity_days || ' days')::interval;
        END IF;
    END IF;

    -- Update subscription
    UPDATE public.user_subscriptions
    SET
        plan_id = v_sub.plan_id,
        plan_type = v_sub.plan_type,
        status = v_sub.status,
        period_start = v_sub.period_start,
        period_end = v_sub.period_end,
        plan_pages_limit = v_sub.plan_pages_limit,
        plan_pages_used = v_sub.plan_pages_used,
        topup_pages_balance = v_sub.topup_pages_balance,
        updated_at = v_now
    WHERE user_id = v_clean_user_id;

    -- Record into user_billing_history
    INSERT INTO public.user_billing_history (
        user_id, plan_id, amount, currency, pages_credited, validity_days,
        razorpay_order_id, razorpay_payment_id, status, created_at
    ) VALUES (
        v_clean_user_id, v_plan.id, v_plan.price_inr, 'INR', v_plan.pages_allotment, v_plan.validity_days,
        p_razorpay_order_id, p_razorpay_payment_id, 'paid', v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'plan_id', v_sub.plan_id,
        'plan_type', v_sub.plan_type,
        'available_pages', (GREATEST(0, v_sub.plan_pages_limit - v_sub.plan_pages_used) + v_sub.topup_pages_balance),
        'period_end', v_sub.period_end
    );
END;
$$;


-- ----------------------------------------------------------------------------
-- 11. GRANT PERMISSIONS
-- ----------------------------------------------------------------------------
GRANT SELECT ON public.billing_plans TO authenticated, anon;
GRANT ALL ON public.billing_plans TO service_role;

GRANT SELECT ON public.user_subscriptions TO authenticated;
GRANT ALL ON public.user_subscriptions TO service_role;

GRANT SELECT ON public.translation_reservations TO authenticated;
GRANT ALL ON public.translation_reservations TO service_role;

GRANT SELECT ON public.user_billing_history TO authenticated;
GRANT ALL ON public.user_billing_history TO service_role;

GRANT EXECUTE ON FUNCTION public.validate_and_reserve_translation_quota(TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_translation_quota(UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.refund_translation_quota(UUID, TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_billing_profile(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.purchase_or_topup_plan(TEXT, TEXT, TEXT, TEXT) TO authenticated, anon, service_role;

-- ============================================================================
-- TRANSLATION BILLING MIGRATION COMPLETE
-- ============================================================================
