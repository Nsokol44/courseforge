-- =====================================================
-- CourseForge — Migration 002
-- Adds readings column to weeks table
-- Run this in your Supabase SQL editor
-- =====================================================

alter table public.weeks
  add column if not exists readings text[] default '{}',
  add column if not exists week_description text;

-- Backfill: move any data stored in dates into week_description
-- (only needed if you generated courses before this migration)
update public.weeks
  set week_description = dates
  where dates is not null and dates != '';
