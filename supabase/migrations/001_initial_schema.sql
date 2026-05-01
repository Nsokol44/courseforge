-- =====================================================
-- CourseForge — Supabase Schema
-- Run this in your Supabase SQL editor
-- =====================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- PROFILES (extends auth.users)
-- ─────────────────────────────────────────
create table public.profiles (
  id           uuid references auth.users(id) on delete cascade primary key,
  full_name    text,
  institution  text,
  department   text,
  title        text,
  created_at   timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────
-- COURSES
-- ─────────────────────────────────────────
create table public.courses (
  id           uuid default uuid_generate_v4() primary key,
  user_id      uuid references auth.users(id) on delete cascade not null,
  title        text not null,
  number       text,
  term         text,
  start_date   date,
  end_date     date,
  total_points integer default 0,
  description  text,
  style_profile jsonb,        -- AI-inferred teaching style chips + description
  blooms_data  jsonb,         -- Bloom's taxonomy scores array
  critique     text,
  diff_view    jsonb,         -- { orig, impr }
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.courses enable row level security;

create policy "Users can CRUD own courses"
  on public.courses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- WEEKS
-- ─────────────────────────────────────────
create table public.weeks (
  id           uuid default uuid_generate_v4() primary key,
  course_id    uuid references public.courses(id) on delete cascade not null,
  user_id      uuid references auth.users(id) on delete cascade not null,
  week_number  integer not null,
  topic        text,
  dates        text,
  assignments  text[],
  tags         text[],
  created_at   timestamptz default now()
);

alter table public.weeks enable row level security;

create policy "Users can CRUD own weeks"
  on public.weeks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- ASSIGNMENTS
-- ─────────────────────────────────────────
create table public.assignments (
  id           uuid default uuid_generate_v4() primary key,
  course_id    uuid references public.courses(id) on delete cascade not null,
  user_id      uuid references auth.users(id) on delete cascade not null,
  title        text not null,
  type         text,
  points       integer default 0,
  week         text,
  due_date     text,
  description  text,
  sort_order   integer default 0,
  created_at   timestamptz default now()
);

alter table public.assignments enable row level security;

create policy "Users can CRUD own assignments"
  on public.assignments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- PYTHON ACTIVITIES
-- ─────────────────────────────────────────
create table public.python_activities (
  id           uuid default uuid_generate_v4() primary key,
  course_id    uuid references public.courses(id) on delete cascade not null,
  user_id      uuid references auth.users(id) on delete cascade not null,
  title        text,
  week         text,
  description  text,
  code         text,
  created_at   timestamptz default now()
);

alter table public.python_activities enable row level security;

create policy "Users can CRUD own python activities"
  on public.python_activities for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- REAL-WORLD ITEMS
-- ─────────────────────────────────────────
create table public.realworld_items (
  id           uuid default uuid_generate_v4() primary key,
  course_id    uuid references public.courses(id) on delete cascade not null,
  user_id      uuid references auth.users(id) on delete cascade not null,
  title        text,
  source       text,
  description  text,
  week         text,
  created_at   timestamptz default now()
);

alter table public.realworld_items enable row level security;

create policy "Users can CRUD own realworld items"
  on public.realworld_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- UPLOADED FILES (metadata only)
-- ─────────────────────────────────────────
create table public.course_files (
  id           uuid default uuid_generate_v4() primary key,
  course_id    uuid references public.courses(id) on delete cascade not null,
  user_id      uuid references auth.users(id) on delete cascade not null,
  filename     text not null,
  file_type    text,
  storage_path text,   -- path in Supabase Storage
  extracted_text text, -- first 4000 chars for AI context
  created_at   timestamptz default now()
);

alter table public.course_files enable row level security;

create policy "Users can CRUD own files"
  on public.course_files for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- STORAGE BUCKET
-- ─────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('course-files', 'course-files', false)
on conflict do nothing;

create policy "Users can upload own files"
  on storage.objects for insert
  with check (bucket_id = 'course-files' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can read own files"
  on storage.objects for select
  using (bucket_id = 'course-files' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete own files"
  on storage.objects for delete
  using (bucket_id = 'course-files' and auth.uid()::text = (storage.foldername(name))[1]);

-- ─────────────────────────────────────────
-- UPDATED_AT trigger for courses
-- ─────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger courses_updated_at
  before update on public.courses
  for each row execute procedure public.set_updated_at();
