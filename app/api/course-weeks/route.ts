import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'

// POST instead of GET — auth cookies work reliably in POST route handlers
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { courseId } = await req.json()
    if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

    // Fetch course and assignments in separate queries to avoid FK join issues
    const { data: course, error: courseErr } = await supabase
      .from('courses')
      .select('id, title, description, style_profile, tool_preferences')
      .eq('id', courseId)
      .single()

    if (courseErr || !course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, title, week')
      .eq('course_id', courseId)

    // Try full column select first; fall back to safe columns if newer migrations weren't run
    let weeks: any[] | null = null
    const { data: weeksData, error: weeksErr } = await supabase
      .from('weeks')
      .select('id, week_number, topic, dates, week_description, concept_overview, readings, assignments, tags, reinforcement_materials')
      .eq('course_id', courseId)
      .order('week_number', { ascending: true })

    if (weeksErr) {
      // Fall back to columns guaranteed by migration 001
      const { data: safeWeeks } = await supabase
        .from('weeks')
        .select('id, week_number, topic, dates, assignments, tags')
        .eq('course_id', courseId)
        .order('week_number', { ascending: true })
      weeks = safeWeeks
    } else {
      weeks = weeksData
    }

    return NextResponse.json({
      weeks: weeks || [],
      course: { ...course, assignments: assignments || [] },
    })
  } catch (err: any) {
    console.error('course-weeks error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
