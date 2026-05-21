-- =====================================================
-- CourseForge — Migration 008
-- Run this in Supabase SQL editor BEFORE using enrich.
-- Idempotent — safe to run multiple times.
-- =====================================================

-- weeks table: add all columns added across migrations 002, 003, 005
alter table public.weeks
  add column if not exists readings               text[]   default '{}',
  add column if not exists week_description       text,
  add column if not exists reinforcement_materials jsonb   default '[]',
  add column if not exists concept_overview       text;

-- courses table
alter table public.courses
  add column if not exists tool_preferences       jsonb    default '{}';

-- realworld_items table
alter table public.realworld_items
  add column if not exists url                    text;

-- profiles: AI provider settings
alter table public.profiles
  add column if not exists ai_provider   text default 'claude',
  add column if not exists gemini_api_key text,
  add column if not exists gemini_model  text default 'gemini-3.1-flash-lite-preview';

-- week_enrichments history table
create table if not exists public.week_enrichments (
  id              uuid default uuid_generate_v4() primary key,
  course_id       uuid references public.courses(id) on delete cascade not null,
  week_id         uuid references public.weeks(id) on delete cascade not null,
  user_id         uuid references auth.users(id) on delete cascade not null,
  week_number     integer not null,
  topic           text,
  assignments     jsonb default '[]',
  readings        jsonb default '[]',
  reinforcement_materials jsonb default '[]',
  realworld       jsonb default '[]',
  concept_overview text,
  created_at      timestamptz default now()
);

alter table public.week_enrichments enable row level security;

drop policy if exists "Users can CRUD own enrichments" on public.week_enrichments;
create policy "Users can CRUD own enrichments"
  on public.week_enrichments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
