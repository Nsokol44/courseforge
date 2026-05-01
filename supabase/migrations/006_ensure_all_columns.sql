-- =====================================================
-- CourseForge — Migration 006
-- Idempotent: ensures ALL optional columns exist.
-- Safe to run even if previous migrations were skipped.
-- Run this in your Supabase SQL editor.
-- =====================================================

-- weeks table
alter table public.weeks
  add column if not exists readings              text[]   default '{}',
  add column if not exists week_description      text,
  add column if not exists reinforcement_materials jsonb  default '[]',
  add column if not exists concept_overview      text;

-- courses table
alter table public.courses
  add column if not exists tool_preferences      jsonb    default '{}';

-- realworld_items table
alter table public.realworld_items
  add column if not exists url                   text;

-- (Already in 001, but safe to repeat)
-- assignments: no extra columns needed beyond what 001 creates
