import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'
import { anthropic, MODEL, extractJSON, buildToolContext } from '@/lib/ai'

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { courseId } = await req.json()
    if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

    // Load the course details + any uploaded file content for context
    const { data: course, error: courseErr } = await supabase
      .from('courses')
      .select('*, course_files(filename, file_type, extracted_text)')
      .eq('id', courseId)
      .single()

    if (courseErr || !course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const fileContext = course.course_files?.length
      ? '\n\nUploaded materials:\n' + course.course_files
          .map((f: any) => `${f.filename}: ${f.extracted_text?.slice(0, 800) || '[binary]'}`)
          .join('\n---\n')
          .slice(0, 3000)
      : ''

    const toolCtx = buildToolContext(course.tool_preferences)

    // Calculate exact week count from course dates
    function calcWeeks(start: string, end: string): number {
      if (!start || !end) return 8 // default to short term if no dates
      const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24))
      return Math.min(18, Math.max(4, Math.round(days / 7)))
    }
    const weekCount = calcWeeks(course.start_date, course.end_date)
    console.log(`Generating schedule: ${weekCount} weeks (${course.start_date} → ${course.end_date})`)

    const prompt = `Generate a complete week-by-week schedule for this course. Return JSON only — nothing before { or after }.

Course: ${course.title} (${course.number || 'no number'})
Term: ${course.term || 'not specified'}
Dates: ${course.start_date || 'not set'} → ${course.end_date || 'not set'}
EXACT WEEK COUNT: ${weekCount} weeks — generate exactly this many, no more, no less
Description: ${course.description || 'Not provided'}
Style: ${course.style_profile ? course.style_profile.chips?.join(', ') + ' — ' + course.style_profile.description : 'Professional academic voice'}${toolCtx}${fileContext}

Return this JSON structure:
{
  "weeks": [
    {
      "week_number": 1,
      "topic": "Specific topic name",
      "description": "2-3 sentences on what students will learn",
      "concept_overview": "3-4 sentence foundational explanation for students encountering this topic for the first time",
      "readings": ["Specific reading title or URL"],
      "assignments_due": []
    }
  ]
}

Rules:
- Generate ALL weeks for the full term (typically 8 weeks for summer, 15-16 for fall/spring)
- If dates are set, count the actual weeks between them; account for any breaks
- For a summer session, 8 weeks is typical — use a compressed but complete schedule
- Topic names must be specific to this subject, not generic like "Week 1 Introduction"
- concept_overview must be student-facing: explain WHY this topic matters and how it connects to prior weeks
- JSON only. Start with {. End with }.`

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: Math.min(6000, Math.max(2000, weekCount * 300)),
      system: `You are CourseForge AI. Respond with valid JSON only — no markdown fences, no text before { or after }.`,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (response.content.find(b => b.type === 'text') as any)?.text || ''
    const jsonStr = extractJSON(raw)

    let weeks: any[] = []
    try {
      const parsed = JSON.parse(jsonStr)
      weeks = parsed.weeks || []
    } catch (e) {
      console.error('generate-schedule parse error. Raw snippet:', raw.slice(0, 400))
      return NextResponse.json({ error: 'Could not parse schedule from AI response. Please try again.' }, { status: 422 })
    }

    if (!weeks.length) {
      return NextResponse.json({ error: 'AI returned no weeks. Please try again.' }, { status: 422 })
    }

    // Clear any existing weeks and insert the new schedule
    await supabase.from('weeks').delete().eq('course_id', courseId)

    const { error: insertError } = await supabase.from('weeks').insert(
      weeks.map((w: any) => ({
        course_id: courseId,
        user_id: user.id,
        week_number: w.week_number,
        topic: w.topic || `Week ${w.week_number}`,
        dates: '',
        week_description: w.description || '',
        concept_overview: w.concept_overview || '',
        readings: Array.isArray(w.readings) ? w.readings : [],
        assignments: Array.isArray(w.assignments_due) ? w.assignments_due : [],
        tags: [],
        reinforcement_materials: [],
      }))
    )

    if (insertError) throw insertError

    return NextResponse.json({ weekCount: weeks.length, weeks })
  } catch (err: any) {
    console.error('generate-schedule error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
