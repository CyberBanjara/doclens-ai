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
