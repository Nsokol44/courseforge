-- =====================================================
-- CourseForge — Migration 005
-- Add concept_overview column to weeks
-- Run in Supabase SQL editor
-- =====================================================

alter table public.weeks
  add column if not exists concept_overview text;

-- concept_overview: foundational explanation of the week's core concept,
-- written for a student encountering it for the first time.
-- Distinct from week_description (admin notes) and readings (sources).
