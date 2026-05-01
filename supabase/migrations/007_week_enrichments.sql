-- =====================================================
-- CourseForge — Migration 007
-- Stores enrichment history per week so instructors
-- can review and revert previous AI suggestions.
-- Run in Supabase SQL editor.
-- =====================================================

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
create policy "Users can CRUD own enrichments"
  on public.week_enrichments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists week_enrichments_week_id_idx on public.week_enrichments(week_id);
create index if not exists week_enrichments_course_id_idx on public.week_enrichments(course_id);
