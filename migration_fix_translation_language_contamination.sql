-- ============================================================================
-- FIX: TRANSLATIONS STORED IN THE WRONG LANGUAGE TABLE   (v2 — timeout-safe)
-- ============================================================================
-- Root cause (application, not database):
--   The client's "union sync" kept a page's previous-language result in IndexedDB
--   after a language switch and, when the newly selected language's table had no
--   row for that page, pushed it into the NEW language's table (e.g. Bengali text
--   -> translations_hindi). The schema (one table per language, unique
--   (book_id, page_number)) is correct; it just had no wrong-script guard.
--
-- HOW TO RUN (Supabase SQL editor): run each STEP as its OWN query.
--   Every step is short, idempotent and safe to re-run. Nothing is deleted
--   until STEP 3, and everything it deletes is first copied in STEP 2.
--
--   STEP 1  Create helpers + quarantine table                 (instant)
--   STEP 2  Copy misplaced rows of ONE table into quarantine  (one call per table)
--   STEP 3  Review, then apply: relocate -> remove -> rebuild book_languages
--   STEP 4  Optional DB trigger guarding against future contamination
--
-- Why v1 timed out: it ran 15 regular expressions over 4000 chars of EVERY row of
-- all 13 tables, twice, in one request. v2 first applies a single cheap regex
-- ("does the first 800 chars contain any foreign script at all?") so the
-- expensive detection only runs on the few suspicious rows, and it processes one
-- table per request (optionally in id batches).
-- ============================================================================


-- ============================================================================
-- STEP 1 — helpers + quarantine table (run once)
-- ============================================================================
drop function if exists public.find_misplaced_translations();

create table if not exists public.translation_language_quarantine (
  id bigint generated always as identity primary key,
  source_table text not null,
  book_id text not null,
  page_number integer not null,
  content text not null,
  detected_script text,
  target_table text,
  relocated boolean not null default false,
  source_updated_at timestamptz,
  quarantined_at timestamptz not null default now(),
  constraint translation_language_quarantine_unique unique (source_table, book_id, page_number)
);
-- No policies: only the service role / SQL editor can read it.
alter table public.translation_language_quarantine enable row level security;

-- Unicode blocks (code points, so this file contains no raw non-ASCII characters).
create or replace function public.translation_script_ranges()
returns table (script text, lo integer, hi integer)
language sql
immutable
parallel safe
as $$
  values
    ('devanagari', 2304, 2431),   -- U+0900–U+097F
    ('bengali',    2432, 2559),   -- U+0980–U+09FF
    ('gurmukhi',   2560, 2687),   -- U+0A00–U+0A7F
    ('gujarati',   2688, 2815),   -- U+0A80–U+0AFF
    ('odia',       2816, 2943),   -- U+0B00–U+0B7F
    ('tamil',      2944, 3071),   -- U+0B80–U+0BFF
    ('telugu',     3072, 3199),   -- U+0C00–U+0C7F
    ('kannada',    3200, 3327),   -- U+0C80–U+0CFF
    ('malayalam',  3328, 3455),   -- U+0D00–U+0D7F
    ('arabic',     1536, 1791),   -- U+0600–U+06FF
    ('cyrillic',   1024, 1279),   -- U+0400–U+04FF
    ('kana',      12352, 12543),  -- U+3040–U+30FF
    ('han',       19968, 40959),  -- U+4E00–U+9FFF
    ('hangul',    44032, 55215)   -- U+AC00–U+D7AF
$$;

-- Expected script for each per-language table.
create or replace function public.expected_translation_script(p_slug text)
returns text
language sql
immutable
parallel safe
as $$
  select case p_slug
    when 'hindi' then 'devanagari'
    when 'marathi' then 'devanagari'
    when 'bengali' then 'bengali'
    when 'gujarati' then 'gujarati'
    when 'tamil' then 'tamil'
    when 'telugu' then 'telugu'
    when 'kannada' then 'kannada'
    when 'malayalam' then 'malayalam'
    when 'mandarin' then 'han'
    when 'english' then 'latin'
    when 'spanish' then 'latin'
    when 'french' then 'latin'
    when 'german' then 'latin'
    else null
  end;
$$;

-- One regex character class matching any script that does NOT belong to the table.
create or replace function public.foreign_script_pattern(p_slug text)
returns text
language sql
immutable
parallel safe
as $$
  select '[' || string_agg(chr(r.lo) || '-' || chr(r.hi), '') || ']'
  from public.translation_script_ranges() r
  where r.script <> coalesce(public.expected_translation_script(p_slug), '')
    and not (public.expected_translation_script(p_slug) = 'han' and r.script = 'kana');
$$;

-- Dominant writing system of a text (mirrors detectDominantScript in the app).
create or replace function public.detect_translation_script(p_content text)
returns text
language sql
immutable
parallel safe
as $$
  with src as (select left(coalesce(p_content, ''), 800) as t),
  counts as (
    select r.script,
           length(regexp_replace(src.t, '[^' || chr(r.lo) || '-' || chr(r.hi) || ']', '', 'g')) as n
    from public.translation_script_ranges() r, src
  ),
  best as (select script, n from counts order by n desc limit 1),
  latin as (
    select length(regexp_replace(src.t, '[^A-Za-z' || chr(192) || '-' || chr(591) || ']', '', 'g')) as n
    from src
  )
  select case
    when (select n from best) >= 20 then (select script from best)
    when (select n from latin) >= 20 then 'latin'
    else null
  end;
$$;

-- Conservative mismatch rule (mirrors isContentScriptMismatch in the app).
create or replace function public.is_translation_script_mismatch(p_expected text, p_detected text)
returns boolean
language sql
immutable
parallel safe
as $$
  select case
    when p_expected is null or p_detected is null then false
    when p_expected = 'latin' then p_detected <> 'latin'
    when p_detected = 'latin' then false              -- English-heavy Indic page: not proof
    when p_expected = 'han' and p_detected = 'kana' then false
    else p_detected <> p_expected
  end;
$$;

-- Destination table for a detected script, only when unambiguous.
create or replace function public.translation_table_for_script(p_detected text)
returns text
language sql
immutable
parallel safe
as $$
  select case p_detected
    when 'bengali' then 'translations_bengali'
    when 'gujarati' then 'translations_gujarati'
    when 'tamil' then 'translations_tamil'
    when 'telugu' then 'translations_telugu'
    when 'kannada' then 'translations_kannada'
    when 'malayalam' then 'translations_malayalam'
    when 'han' then 'translations_mandarin'
    -- 'devanagari' (Hindi or Marathi) and 'latin' are ambiguous: not auto-moved.
    else null
  end;
$$;

-- STEP 2 worker: copies misplaced rows of one table into the quarantine (non-destructive).
-- p_batch = null scans the whole table; pass a number (e.g. 20000) to scan in id batches
-- and re-run with the returned next_after_id until it is null.
create or replace function public.quarantine_misplaced_translations(
  p_slug text,
  p_after_id bigint default 0,
  p_batch integer default null
)
returns jsonb
language plpgsql
as $$
declare
  v_tbl text := 'translations_' || p_slug;
  v_expected text := public.expected_translation_script(p_slug);
  v_scanned bigint;
  v_last bigint;
  v_inserted bigint;
begin
  if v_expected is null or to_regclass('public.' || v_tbl) is null then
    return jsonb_build_object('table', v_tbl, 'skipped', true);
  end if;

  execute format($q$
    with scanned as (
      select t.id, t.book_id, t.page_number, t.content, t.updated_at
      from public.%I t
      where t.id > $1
      order by t.id
      limit $2
    ),
    candidates as (
      select s.*, public.detect_translation_script(s.content) as det
      from scanned s
      where left(s.content, 800) ~ %L          -- cheap pre-filter: any foreign script at all?
    ),
    ins as (
      insert into public.translation_language_quarantine
        (source_table, book_id, page_number, content, detected_script, target_table, source_updated_at)
      select %L, c.book_id, c.page_number, c.content, c.det,
             public.translation_table_for_script(c.det), c.updated_at
      from candidates c
      where public.is_translation_script_mismatch(%L, c.det)
      on conflict (source_table, book_id, page_number) do nothing
      returning 1
    )
    select (select count(*) from scanned), (select max(id) from scanned), (select count(*) from ins)
  $q$, v_tbl, public.foreign_script_pattern(p_slug), v_tbl, v_expected)
  into v_scanned, v_last, v_inserted
  using p_after_id, p_batch;

  return jsonb_build_object(
    'table', v_tbl,
    'scanned', v_scanned,
    'quarantined', v_inserted,
    'next_after_id', case when p_batch is not null and v_scanned = p_batch then v_last end
  );
end;
$$;

-- STEP 3 worker: relocate -> remove -> rebuild book_languages. Touches only quarantined rows.
create or replace function public.apply_translation_quarantine()
returns jsonb
language plpgsql
as $$
declare
  v_target text;
  v_tbl text;
  v_n integer;
  v_moved integer := 0;
  v_removed integer := 0;
  v_rebuilt integer := 0;
  r record;
  v_pages integer[];
begin
  -- 1. Relocate into the correct table; existing translations there are NEVER overwritten.
  for v_target in
    select distinct target_table from public.translation_language_quarantine
    where target_table is not null and not relocated
  loop
    if to_regclass('public.' || v_target) is null then
      continue;
    end if;
    execute format($q$
      insert into public.%I (book_id, page_number, content, updated_at)
      select q.book_id, q.page_number, q.content, coalesce(q.source_updated_at, now())
      from public.translation_language_quarantine q
      where q.target_table = %L and not q.relocated
      on conflict (book_id, page_number) do nothing
    $q$, v_target, v_target);
    get diagnostics v_n = row_count;
    v_moved := v_moved + v_n;
    update public.translation_language_quarantine
       set relocated = true
     where target_table = v_target and not relocated;
  end loop;

  -- 2. Remove misplaced rows from the wrong table (only if unchanged since quarantine).
  for v_tbl in select distinct source_table from public.translation_language_quarantine loop
    execute format($q$
      delete from public.%I t
      using public.translation_language_quarantine q
      where q.source_table = %L
        and t.book_id = q.book_id
        and t.page_number = q.page_number
        and t.content = q.content
    $q$, v_tbl, v_tbl);
    get diagnostics v_n = row_count;
    v_removed := v_removed + v_n;
  end loop;

  -- 3. Rebuild book_languages for every affected (book, language).
  for r in
    select distinct book_id, replace(source_table, 'translations_', '') as slug
    from public.translation_language_quarantine
    union
    select distinct book_id, replace(target_table, 'translations_', '')
    from public.translation_language_quarantine
    where target_table is not null
  loop
    if to_regclass('public.translations_' || r.slug) is null then
      continue;
    end if;
    execute format(
      'select coalesce(array_agg(distinct page_number order by page_number), ''{}''::integer[])
         from public.%I where book_id = $1 and page_number > 0',
      'translations_' || r.slug
    ) into v_pages using r.book_id;

    if cardinality(v_pages) = 0 then
      delete from public.book_languages where book_id = r.book_id and language = r.slug;
    else
      insert into public.book_languages (book_id, language, pages, translated_count, updated_at)
      values (r.book_id, r.slug, v_pages, cardinality(v_pages), now())
      on conflict (book_id, language) do update
        set pages = excluded.pages,
            translated_count = excluded.translated_count,
            updated_at = excluded.updated_at;
    end if;
    v_rebuilt := v_rebuilt + 1;
  end loop;

  return jsonb_build_object(
    'relocated', v_moved,
    'removed_from_wrong_table', v_removed,
    'book_languages_rebuilt', v_rebuilt
  );
end;
$$;


-- ============================================================================
-- STEP 2 — quarantine (copy only, nothing deleted). Run each line as its own query.
-- ============================================================================
-- select public.quarantine_misplaced_translations('hindi');
-- select public.quarantine_misplaced_translations('bengali');
-- select public.quarantine_misplaced_translations('telugu');
-- select public.quarantine_misplaced_translations('tamil');
-- select public.quarantine_misplaced_translations('malayalam');
-- select public.quarantine_misplaced_translations('kannada');
-- select public.quarantine_misplaced_translations('marathi');
-- select public.quarantine_misplaced_translations('gujarati');
-- select public.quarantine_misplaced_translations('english');
-- select public.quarantine_misplaced_translations('spanish');
-- select public.quarantine_misplaced_translations('french');
-- select public.quarantine_misplaced_translations('german');
-- select public.quarantine_misplaced_translations('mandarin');
--
-- If one table still times out, scan it in batches and repeat with next_after_id:
-- select public.quarantine_misplaced_translations('hindi', 0, 20000);


-- ============================================================================
-- STEP 3 — review, then apply
-- ============================================================================
-- Review:
-- select source_table, detected_script, target_table, relocated, count(*)
-- from public.translation_language_quarantine group by 1,2,3,4 order by 1,2;
--
-- select source_table, book_id, page_number, detected_script, target_table, left(content, 120)
-- from public.translation_language_quarantine order by 1,2,3;
--
-- Apply (fast: only touches quarantined rows):
-- select public.apply_translation_quarantine();
--
-- Ambiguous rows (Devanagari / Latin) stay in the quarantine with target_table IS NULL.
-- After checking them, e.g. move Devanagari rows found in translations_bengali to Hindi:
--   insert into public.translations_hindi (book_id, page_number, content, updated_at)
--   select book_id, page_number, content, coalesce(source_updated_at, now())
--   from public.translation_language_quarantine
--   where detected_script = 'devanagari' and target_table is null
--   on conflict (book_id, page_number) do nothing;


-- ============================================================================
-- STEP 4 — OPTIONAL database-level guard (run after STEP 3).
-- Rejects INSERT/UPDATE of content whose script clearly belongs to another language.
-- ============================================================================
-- create or replace function public.guard_translation_language()
-- returns trigger
-- language plpgsql
-- as $$
-- declare
--   v_slug text := replace(tg_table_name, 'translations_', '');
--   v_detected text;
-- begin
--   if left(new.content, 800) !~ public.foreign_script_pattern(v_slug) then
--     return new;                                   -- fast path: no foreign script at all
--   end if;
--   v_detected := public.detect_translation_script(new.content);
--   if public.is_translation_script_mismatch(public.expected_translation_script(v_slug), v_detected) then
--     raise exception 'Content in % script rejected for table %', v_detected, tg_table_name
--       using errcode = 'check_violation';
--   end if;
--   return new;
-- end;
-- $$;
--
-- do $$
-- declare v_slug text;
-- begin
--   foreach v_slug in array array[
--     'hindi','telugu','tamil','bengali','malayalam','kannada','marathi','gujarati',
--     'english','spanish','french','german','mandarin'
--   ] loop
--     if to_regclass('public.translations_' || v_slug) is null then continue; end if;
--     execute format('drop trigger if exists trg_guard_language on public.%I', 'translations_' || v_slug);
--     execute format(
--       'create trigger trg_guard_language before insert or update of content on public.%I
--          for each row execute function public.guard_translation_language()',
--       'translations_' || v_slug);
--   end loop;
-- end;
-- $$;
