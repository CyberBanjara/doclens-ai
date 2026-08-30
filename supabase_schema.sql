-- Run this in the Supabase SQL Editor (Project -> SQL Editor)
-- It stores one row per extracted PDF, keyed by the filename.

create table if not exists pdf_extractions (
    id text primary key,           -- Filename key
    key text not null,
    size bigint,
    last_modified text,            -- R2 LastModified metadata
    num_pages integer,
    text text not null,            -- Serialized pages, original text, and translation results
    used_ocr boolean not null default false,
    extracted_at timestamptz not null default now()
);

-- Secure the table: Only server functions using the Service Role Key can read/write by default.
alter table pdf_extractions enable row level security;

-- Allow read-only access (select) to the public/anon role.
-- This is necessary in environments (like production read-only deploys) where SUPABASE_SECRET_KEY is omitted.
create policy "Allow public read access" on pdf_extractions 
    for select 
    to anon, authenticated, service_role 
    using (true);

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

