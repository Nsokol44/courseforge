// ── BROWSER CLIENT ──
// Safe to import in 'use client' components.
// Never imports next/headers or any server-only module.

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Course, Week, Assignment } from '@/types'

export const createBrowserClient = () =>
  createClientComponentClient()

// ─────────────────────────────────────────
// Shared query helpers (browser-safe)
// ─────────────────────────────────────────

export async function getCourseWithRelations(
  supabase: ReturnType<typeof createBrowserClient>,
  courseId: string
): Promise<Course | null> {
  const { data, error } = await supabase
    .from('courses')
    .select(`
      *,
      weeks(*),
      assignments(*),
      python_activities(*),
      realworld_items(*),
      course_files(id, filename, file_type, created_at)
    `)
    .eq('id', courseId)
    .single()

  if (error) { console.error('getCourseWithRelations:', error); return null }
  return data as Course
}

export async function upsertWeeks(
  supabase: ReturnType<typeof createBrowserClient>,
  courseId: string,
  userId: string,
  weeks: Omit<Week, 'id' | 'created_at'>[]
) {
  await supabase.from('weeks').delete().eq('course_id', courseId)
  if (!weeks.length) return
  const { error } = await supabase.from('weeks').insert(
    weeks.map(w => ({ ...w, course_id: courseId, user_id: userId }))
  )
  if (error) console.error('upsertWeeks:', error)
}

export async function upsertAssignments(
  supabase: ReturnType<typeof createBrowserClient>,
  courseId: string,
  userId: string,
  assignments: Omit<Assignment, 'id' | 'created_at'>[]
) {
  await supabase.from('assignments').delete().eq('course_id', courseId)
  if (!assignments.length) return
  const { error } = await supabase.from('assignments').insert(
    assignments.map((a, i) => ({ ...a, course_id: courseId, user_id: userId, sort_order: i }))
  )
  if (error) console.error('upsertAssignments:', error)
}
