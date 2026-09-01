-- ============================================================================
-- MULTI-TABLE LANGUAGE-BASED STORAGE SYSTEM
-- ============================================================================
-- Rule: Same book + Same language = Reuse existing page and never process again.
-- Each language has its own dedicated table with (book_id, page_number) unique constraint.

-- 1. Hindi
create table if not exists translations_hindi (
    id bigint generated always as identity primary key,
    book_id text not null,
    page_number integer not null,
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint translations_hindi_book_page_unique unique (book_id, page_number)
);
create index if not exists idx_translations_hindi_book on translations_hindi (book_id);
create index if not exists idx_translations_hindi_book_page on translations_hindi (book_id, page_number);
alter table translations_hindi enable row level security;
create policy "Allow public read access on translations_hindi" on translations_hindi
    for select to anon, authenticated, service_role using (true);
create policy "Allow service_role full access on translations_hindi" on translations_hindi
    for all to service_role using (true) with check (true);

-- 2. Telugu
create table if not exists translations_telugu (
    id bigint generated always as identity primary key,
    book_id text not null,
    page_number integer not null,
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint translations_telugu_book_page_unique unique (book_id, page_number)
);
create index if not exists idx_translations_telugu_book on translations_telugu (book_id);
create index if not exists idx_translations_telugu_book_page on translations_telugu (book_id, page_number);
alter table translations_telugu enable row level security;
create policy "Allow public read access on translations_telugu" on translations_telugu
    for select to anon, authenticated, service_role using (true);
create policy "Allow service_role full access on translations_telugu" on translations_telugu
    for all to service_role using (true) with check (true);

-- 3. Tamil
create table if not exists translations_tamil (
    id bigint generated always as identity primary key,
    book_id text not null,
    page_number integer not null,
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint translations_tamil_book_page_unique unique (book_id, page_number)
);
create index if not exists idx_translations_tamil_book on translations_tamil (book_id);
create index if not exists idx_translations_tamil_book_page on translations_tamil (book_id, page_number);
alter table translations_tamil enable row level security;
create policy "Allow public read access on translations_tamil" on translations_tamil
    for select to anon, authenticated, service_role using (true);
create policy "Allow service_role full access on translations_tamil" on translations_tamil
    for all to service_role using (true) with check (true);

-- 4. Bengali
create table if not exists translations_bengali (
    id bigint generated always as identity primary key,
    book_id text not null,
    page_number integer not null,
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint translations_bengali_book_page_unique unique (book_id, page_number)
);
create index if not exists idx_translations_bengali_book on translations_bengali (book_id);
create index if not exists idx_translations_bengali_book_page on translations_bengali (book_id, page_number);
alter table translations_bengali enable row level security;
create policy "Allow public read access on translations_bengali" on translations_bengali
    for select to anon, authenticated, service_role using (true);
create policy "Allow service_role full access on translations_bengali" on translations_bengali
    for all to service_role using (true) with check (true);

-- 5. Malayalam
create table if not exists translations_malayalam (
    id bigint generated always as identity primary key,
    book_id text not null,
    page_number integer not null,
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint translations_malayalam_book_page_unique unique (book_id, page_number)
);
create index if not exists idx_translations_malayalam_book on translations_malayalam (book_id);
create index if not exists idx_translations_malayalam_book_page on translations_malayalam (book_id, page_number);
alter table translations_malayalam enable row level security;
create policy "Allow public read access on translations_malayalam" on translations_malayalam
    for select to anon, authenticated, service_role using (true);
create policy "Allow service_role full access on translations_malayalam" on translations_malayalam
    for all to service_role using (true) with check (true);

-- 6. Kannada
create table if not exists translations_kannada (
    id bigint generated always as identity primary key,
    book_id text not null,
    page_number integer not null,
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint translations_kannada_book_page_unique unique (book_id, page_number)
);
create index if not exists idx_translations_kannada_book on translations_kannada (book_id);
create index if not exists idx_translations_kannada_book_page on translations_kannada (book_id, page_number);
alter table translations_kannada enable row level security;
create policy "Allow public read access on translations_kannada" on translations_kannada
    for select to anon, authenticated, service_role using (true);
create policy "Allow service_role full access on translations_kannada" on translations_kannada
    for all to service_role using (true) with check (true);

-- 7. Marathi
create table if not exists translations_marathi (
    id bigint generated always as identity primary key,
    book_id text not null,
    page_number integer not null,
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint translations_marathi_book_page_unique unique (book_id, page_number)
);
create index if not exists idx_translations_marathi_book on translations_marathi (book_id);
create index if not exists idx_translations_marathi_book_page on translations_marathi (book_id, page_number);
alter table translations_marathi enable row level security;
create policy "Allow public read access on translations_marathi" on translations_marathi
    for select to anon, authenticated, service_role using (true);
create policy "Allow service_role full access on translations_marathi" on translations_marathi
    for all to service_role using (true) with check (true);

-- 8. Gujarati
create table if not exists translations_gujarati (
    id bigint generated always as identity primary key,
    book_id text not null,
    page_number integer not null,
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint translations_gujarati_book_page_unique unique (book_id, page_number)
);
create index if not exists idx_translations_gujarati_book on translations_gujarati (book_id);
create index if not exists idx_translations_gujarati_book_page on translations_gujarati (book_id, page_number);
alter table translations_gujarati enable row level security;
create policy "Allow public read access on translations_gujarati" on translations_gujarati
    for select to anon, authenticated, service_role using (true);
create policy "Allow service_role full access on translations_gujarati" on translations_gujarati
    for all to service_role using (true) with check (true);

-- 9. English
create table if not exists translations_english (
    id bigint generated always as identity primary key,
    book_id text not null,
    page_number integer not null,
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint translations_english_book_page_unique unique (book_id, page_number)
);
create index if not exists idx_translations_english_book on translations_english (book_id);
create index if not exists idx_translations_english_book_page on translations_english (book_id, page_number);
alter table translations_english enable row level security;
create policy "Allow public read access on translations_english" on translations_english
    for select to anon, authenticated, service_role using (true);
create policy "Allow service_role full access on translations_english" on translations_english
    for all to service_role using (true) with check (true);

-- 10. Spanish
create table if not exists translations_spanish (
    id bigint generated always as identity primary key,
    book_id text not null,
    page_number integer not null,
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint translations_spanish_book_page_unique unique (book_id, page_number)
);
create index if not exists idx_translations_spanish_book on translations_spanish (book_id);
create index if not exists idx_translations_spanish_book_page on translations_spanish (book_id, page_number);
alter table translations_spanish enable row level security;
create policy "Allow public read access on translations_spanish" on translations_spanish
    for select to anon, authenticated, service_role using (true);
create policy "Allow service_role full access on translations_spanish" on translations_spanish
    for all to service_role using (true) with check (true);

-- 11. French
create table if not exists translations_french (
    id bigint generated always as identity primary key,
    book_id text not null,
    page_number integer not null,
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint translations_french_book_page_unique unique (book_id, page_number)
);
create index if not exists idx_translations_french_book on translations_french (book_id);
create index if not exists idx_translations_french_book_page on translations_french (book_id, page_number);
alter table translations_french enable row level security;
create policy "Allow public read access on translations_french" on translations_french
    for select to anon, authenticated, service_role using (true);
create policy "Allow service_role full access on translations_french" on translations_french
    for all to service_role using (true) with check (true);

-- 12. German
create table if not exists translations_german (
    id bigint generated always as identity primary key,
    book_id text not null,
    page_number integer not null,
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint translations_german_book_page_unique unique (book_id, page_number)
);
create index if not exists idx_translations_german_book on translations_german (book_id);
create index if not exists idx_translations_german_book_page on translations_german (book_id, page_number);
alter table translations_german enable row level security;
create policy "Allow public read access on translations_german" on translations_german
    for select to anon, authenticated, service_role using (true);
create policy "Allow service_role full access on translations_german" on translations_german
    for all to service_role using (true) with check (true);

-- 13. Mandarin
create table if not exists translations_mandarin (
    id bigint generated always as identity primary key,
    book_id text not null,
    page_number integer not null,
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint translations_mandarin_book_page_unique unique (book_id, page_number)
);
create index if not exists idx_translations_mandarin_book on translations_mandarin (book_id);
create index if not exists idx_translations_mandarin_book_page on translations_mandarin (book_id, page_number);
alter table translations_mandarin enable row level security;
create policy "Allow public read access on translations_mandarin" on translations_mandarin
    for select to anon, authenticated, service_role using (true);
create policy "Allow service_role full access on translations_mandarin" on translations_mandarin
    for all to service_role using (true) with check (true);

-- ============================================================================
-- DIRECT ADVERTISING & SPONSORSHIPS SYSTEM
-- ============================================================================

create table if not exists ads (
    id uuid primary key default gen_random_uuid(),
    advertiser_name text not null,
    advertiser_email text not null,
    advertiser_company text,
    title text not null,
    description text,
    image_url text not null,
    target_url text not null,
    package_name text not null default 'Startup Showcase (7 Days)',
    duration_days integer not null default 7,
    amount_paid numeric not null default 5000,
    payment_status text not null default 'pending', -- 'pending' | 'paid' | 'waived' | 'failed'
    approval_status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
    approved_at timestamptz,
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS)
alter table ads enable row level security;

-- 1. Public Read Policy: Allow anyone (anon and authenticated) to view active, approved ads that have not expired
create policy "Allow public read of active approved ads" on ads
    for select
    to anon, authenticated, service_role
    using (
        approval_status = 'approved' 
        and expires_at is not null 
        and expires_at > now()
    );

-- 2. Public Insert Policy: Allow advertisers to submit new ads with 'pending' status and null approval/expiration
create policy "Allow public submission of pending ads" on ads
    for insert
    to anon, authenticated, service_role
    with check (
        approval_status = 'pending' 
        and approved_at is null 
        and expires_at is null
    );

-- 3. Service Role Policy: Full administrative control for verified server functions using the write token
create policy "Allow service_role full access on ads" on ads
    for all
    to service_role
    using (true)
    with check (true);

-- Performance Indexes
create index if not exists idx_ads_active on ads (approval_status, expires_at);
create index if not exists idx_ads_created on ads (created_at desc);
create index if not exists idx_ads_approval on ads (approval_status);

-- ============================================================================
-- BOOK TRANSLATION AVAILABILITY METADATA (SINGLE SOURCE OF TRUTH)
-- ============================================================================
-- Tracks which translation languages are available for each book_id,
-- along with the complete list of translated page numbers for that language.
-- Example: Book → Hindi → pages: [1, 2, 3, 4...]
--          Book → Telugu → pages: [1, 2...]

create table if not exists book_languages (
    id bigint generated always as identity primary key,
    book_id text not null,
    language text not null,                      -- Normalized language slug (e.g. 'hindi', 'telugu', 'bengali')
    pages integer[] not null default '{}',       -- Complete list of translated page numbers for this book & language
    translated_count integer not null default 0, -- Total count of translated pages (cardinality of pages)
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint book_languages_book_lang_unique unique (book_id, language)
);

-- Migration helpers if book_languages table already existed:
alter table book_languages add column if not exists pages integer[] not null default '{}';
alter table book_languages add column if not exists translated_count integer not null default 0;

-- Indexes for lightning fast lookups
create index if not exists idx_book_languages_book_id on book_languages (book_id);
create index if not exists idx_book_languages_lookup on book_languages (book_id, language);
create index if not exists idx_book_languages_pages on book_languages using gin (pages);

alter table book_languages enable row level security;

-- Public read access so Workspace can fetch available languages anonymously or authenticated
create policy "Allow public read access on book_languages" on book_languages
    for select to anon, authenticated, service_role using (true);

-- Full access for backend write functions using the sync token
create policy "Allow service_role full access on book_languages" on book_languages
    for all to service_role using (true) with check (true);


