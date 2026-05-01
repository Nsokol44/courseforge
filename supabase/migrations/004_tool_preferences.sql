-- =====================================================
-- CourseForge — Migration 004
-- Add tool preferences and course settings
-- Run in Supabase SQL editor
-- =====================================================

alter table public.courses
  add column if not exists tool_preferences jsonb default '{}';

-- tool_preferences shape:
-- {
--   "python_env": "Google Colab" | "Jupyter" | "VS Code" | "Local Python" | "None",
--   "gis_software": "QGIS" | "ArcGIS" | "ArcGIS Online" | "None",
--   "submission_format": "Jupyter Notebook (.ipynb)" | "Google Colab Link" | "PDF" | "Word Doc" | "Canvas Quiz" | "Any",
--   "lms": "Canvas" | "Blackboard" | "Moodle" | "Other",
--   "custom_tools": ["tool1", "tool2"],
--   "constraints": "Free text — any special notes about tools or environment"
-- }
