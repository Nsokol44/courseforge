-- =====================================================
-- CourseForge — Migration 003
-- Adds reinforcement materials to weeks
-- Adds url field to realworld_items
-- Run this in your Supabase SQL editor
-- =====================================================

alter table public.weeks
  add column if not exists reinforcement_materials jsonb default '[]';
-- reinforcement_materials shape:
-- [{ "type": "video|article|tool|dataset|exercise", "title": "...", "url": "...", "description": "..." }]

alter table public.realworld_items
  add column if not exists url text;
