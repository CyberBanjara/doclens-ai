-- ============================================================================
-- TEMPORARY & IDEMPOTENT SQL MIGRATION: PAGE TRANSLATION TRACKING SYSTEM
-- ============================================================================
-- Feature: Accurate, Real-Time Translation Tracking & GitHub-Style Heatmap History
-- Target: Supabase SQL Editor
-- 
-- SAFETY NOTICE ON TABLE MODIFICATIONS:
-- 1. NO EXISTING TABLES ARE DROPPED OR DELETED.
--    All existing tables ('user_translation_counters', 'ads', 'book_languages',
--    and all 'translations_<language>' tables) and their production data are PRESERVED.
-- 2. This script is fully IDEMPOTENT and safe to run multiple times.
--    Existing structures are updated using 'IF NOT EXISTS', 'DO $$ ... $$' blocks,
--    and 'DROP POLICY IF EXISTS' before re-creating policies.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: CREATE OR UPDATE `user_translation_activities` TABLE
-- ----------------------------------------------------------------------------
-- Records granular user-specific translation history mapped to book titles,
-- page numbers, and timestamps to drive the pricing model and activity heatmaps.

CREATE TABLE IF NOT EXISTS public.user_translation_activities (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    book_title TEXT NOT NULL DEFAULT 'Untitled Document',
    doc_id TEXT,
    page_number INTEGER NOT NULL,
    language TEXT NOT NULL DEFAULT 'default',
    page_key TEXT NOT NULL,
    translated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    translated_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::DATE
);

-- Idempotently ensure all expected columns exist if the table already existed
DO $$
BEGIN
    ALTER TABLE public.user_translation_activities ADD COLUMN IF NOT EXISTS book_title TEXT NOT NULL DEFAULT 'Untitled Document';
    ALTER TABLE public.user_translation_activities ADD COLUMN IF NOT EXISTS doc_id TEXT;
    ALTER TABLE public.user_translation_activities ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'default';
    ALTER TABLE public.user_translation_activities ADD COLUMN IF NOT EXISTS page_key TEXT;
    ALTER TABLE public.user_translation_activities ADD COLUMN IF NOT EXISTS translated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE public.user_translation_activities ADD COLUMN IF NOT EXISTS translated_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::DATE;
END $$;

-- Enforce unique constraint for deduplication: 1 translation per (user_id, page_key)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_translation_activities_user_page_key_unique'
          AND conrelid = 'public.user_translation_activities'::regclass
    ) THEN
        ALTER TABLE public.user_translation_activities 
        ADD CONSTRAINT user_translation_activities_user_page_key_unique UNIQUE (user_id, page_key);
    END IF;
END $$;

-- Performance indexes for lightning-fast user activity queries
CREATE INDEX IF NOT EXISTS idx_user_translation_activities_user 
    ON public.user_translation_activities (user_id);

CREATE INDEX IF NOT EXISTS idx_user_translation_activities_user_date 
    ON public.user_translation_activities (user_id, translated_date DESC);

CREATE INDEX IF NOT EXISTS idx_user_translation_activities_user_book 
    ON public.user_translation_activities (user_id, book_id);


-- ----------------------------------------------------------------------------
-- STEP 2: ENSURE `user_translation_counters` TABLE EXISTS
-- ----------------------------------------------------------------------------
-- Maintains an atomic total counter per user for fast O(1) total reads.

CREATE TABLE IF NOT EXISTS public.user_translation_counters (
    user_id TEXT PRIMARY KEY,
    total_translated_pages INTEGER NOT NULL DEFAULT 0,
    page_keys TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotently ensure all expected columns exist if the table already existed
DO $$
BEGIN
    ALTER TABLE public.user_translation_counters ADD COLUMN IF NOT EXISTS total_translated_pages INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE public.user_translation_counters ADD COLUMN IF NOT EXISTS page_keys TEXT[] NOT NULL DEFAULT '{}';
    ALTER TABLE public.user_translation_counters ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE public.user_translation_counters ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
END $$;

-- Ensure index exists
CREATE INDEX IF NOT EXISTS idx_user_translation_counters_user 
    ON public.user_translation_counters (user_id);


-- ----------------------------------------------------------------------------
-- STEP 3: CONFIGURE ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
-- Guarantees that each user can ONLY access their own activity data.

ALTER TABLE public.user_translation_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_translation_counters ENABLE ROW LEVEL SECURITY;

-- Policies for user_translation_activities
DROP POLICY IF EXISTS "Allow users to read their own translation activities" ON public.user_translation_activities;
CREATE POLICY "Allow users to read their own translation activities" ON public.user_translation_activities
    FOR SELECT
    TO authenticated
    USING (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "Allow service_role full access on user_translation_activities" ON public.user_translation_activities;
CREATE POLICY "Allow service_role full access on user_translation_activities" ON public.user_translation_activities
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policies for user_translation_counters
DROP POLICY IF EXISTS "Allow users to read their own translation counter" ON public.user_translation_counters;
CREATE POLICY "Allow users to read their own translation counter" ON public.user_translation_counters
    FOR SELECT
    TO authenticated
    USING (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "Allow service_role full access on user_translation_counters" ON public.user_translation_counters;
CREATE POLICY "Allow service_role full access on user_translation_counters" ON public.user_translation_counters
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- ----------------------------------------------------------------------------
-- STEP 4: ATOMIC STORED PROCEDURES
-- ----------------------------------------------------------------------------

-- Procedure 1: Detailed activity recording with book title mapping and atomic counter increment
CREATE OR REPLACE FUNCTION public.record_page_translation_activity(
    p_user_id TEXT,
    p_book_id TEXT,
    p_book_title TEXT,
    p_doc_id TEXT,
    p_page_number INTEGER,
    p_language TEXT,
    p_page_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inserted_id BIGINT;
    v_total INTEGER;
    v_already_counted BOOLEAN := false;
BEGIN
    -- 1. Try inserting granular activity record (deduplicated by user_id and page_key)
    INSERT INTO public.user_translation_activities (
        user_id,
        book_id,
        book_title,
        doc_id,
        page_number,
        language,
        page_key,
        translated_at,
        translated_date
    )
    VALUES (
        p_user_id,
        p_book_id,
        COALESCE(NULLIF(TRIM(p_book_title), ''), 'Untitled Document'),
        p_doc_id,
        p_page_number,
        COALESCE(NULLIF(TRIM(p_language), ''), 'default'),
        p_page_key,
        now(),
        (now() AT TIME ZONE 'utc')::DATE
    )
    ON CONFLICT (user_id, page_key) DO NOTHING
    RETURNING id INTO v_inserted_id;

    -- If v_inserted_id is null, this page was already translated and counted
    IF v_inserted_id IS NULL THEN
        v_already_counted := true;
    END IF;

    -- 2. Ensure user counter row exists
    INSERT INTO public.user_translation_counters (user_id, total_translated_pages, page_keys, created_at, updated_at)
    VALUES (p_user_id, 0, '{}', now(), now())
    ON CONFLICT (user_id) DO NOTHING;

    -- 3. If freshly inserted, increment total counter atomically
    IF NOT v_already_counted THEN
        UPDATE public.user_translation_counters
        SET
            total_translated_pages = total_translated_pages + 1,
            page_keys = array_append(page_keys, p_page_key),
            updated_at = now()
        WHERE user_id = p_user_id
          AND NOT (p_page_key = ANY(page_keys))
        RETURNING total_translated_pages INTO v_total;
    END IF;

    -- 4. Get current counter if not updated in step 3
    IF v_total IS NULL THEN
        SELECT total_translated_pages INTO v_total
        FROM public.user_translation_counters
        WHERE user_id = p_user_id;
    END IF;

    RETURN jsonb_build_object(
        'total_translated_pages', COALESCE(v_total, 0),
        'already_counted', v_already_counted,
        'activity_id', v_inserted_id
    );
END;
$$;

-- Procedure 2: Backward-compatible procedure alias
CREATE OR REPLACE FUNCTION public.increment_user_translation_counter(
    p_user_id TEXT,
    p_page_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- 1. Ensure user row exists
    INSERT INTO public.user_translation_counters (user_id, total_translated_pages, page_keys, created_at, updated_at)
    VALUES (p_user_id, 0, '{}', now(), now())
    ON CONFLICT (user_id) DO NOTHING;

    -- 2. Atomically increment only if p_page_key has not been counted yet
    UPDATE public.user_translation_counters
    SET 
        total_translated_pages = total_translated_pages + 1,
        page_keys = array_append(page_keys, p_page_key),
        updated_at = now()
    WHERE user_id = p_user_id
      AND NOT (p_page_key = ANY(page_keys))
    RETURNING total_translated_pages INTO v_count;

    -- 3. If key was already present (duplicate/retry), return existing counter without incrementing
    IF v_count IS NULL THEN
        SELECT total_translated_pages INTO v_count
        FROM public.user_translation_counters
        WHERE user_id = p_user_id;
    END IF;

    RETURN COALESCE(v_count, 0);
END;
$$;


-- ----------------------------------------------------------------------------
-- STEP 5: GRANT PERMISSIONS
-- ----------------------------------------------------------------------------

GRANT SELECT ON public.user_translation_activities TO authenticated;
GRANT ALL ON public.user_translation_activities TO service_role;

GRANT SELECT ON public.user_translation_counters TO authenticated;
GRANT ALL ON public.user_translation_counters TO service_role;

GRANT EXECUTE ON FUNCTION public.record_page_translation_activity(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.increment_user_translation_counter(TEXT, TEXT) TO authenticated, anon, service_role;

-- ============================================================================
-- MIGRATION COMPLETE: All tables, constraints, indexes & functions are ready.
-- ============================================================================
