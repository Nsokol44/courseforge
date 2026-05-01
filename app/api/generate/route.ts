import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'
import { anthropic, MODEL, buildGenerationSystemPrompt, buildGenerationPrompt, parseGenerationResponse } from '@/lib/ai'
import type { GenerateRequest } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = { user }

    const body: GenerateRequest = await req.json()
    const { title, number, description, level, mode, startDate, endDate, holidays, pattern, styleContext, options, professorName, institution, toolPreferences } = body

    // ── Calculate exact week count from dates ──
    function calcWeekCount(start: string, end: string): number {
      if (!start || !end) return 15 // default full semester
      const s = new Date(start)
      const e = new Date(end)
      const days = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
      const weeks = Math.round(days / 7)
      // Clamp: minimum 4 weeks (short module), maximum 18 (extended semester)
      return Math.min(18, Math.max(4, weeks))
    }
    const weekCount = calcWeekCount(startDate, endDate)
    console.log(`Generating ${weekCount}-week course (${startDate} → ${endDate})`)

    // ── Call Claude for structured JSON output ──
    // max_tokens scales with week count: ~350 tokens per week covers all sections
    const maxTokens = Math.min(8000, Math.max(4000, weekCount * 400))

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: buildGenerationSystemPrompt(professorName, institution),
      messages: [{
        role: 'user',
        content: buildGenerationPrompt({ title, number, description, level, mode, startDate, endDate, holidays, pattern, styleContext, professorName, institution, options, toolPreferences, weekCount }),
      }],
    })

    const raw = response.content.find(b => b.type === 'text')?.text || ''
    const parsed = parseGenerationResponse(raw)

    // Surface parse failures clearly rather than silently saving an empty course
    if (!parsed.weeks?.length && !parsed.assignments?.length) {
      console.error('Generation produced no parseable content. Raw snippet:', raw.slice(0, 800))
      return NextResponse.json({
        error: 'Claude returned content that could not be parsed into a course structure. This usually means the response was cut off. Try again — if it keeps failing, simplify the course description.',
      }, { status: 422 })
    }

    console.log(`Generation parsed: ${parsed.weeks?.length} weeks, ${parsed.assignments?.length} assignments, ${parsed.realworld?.length} realworld, ${parsed.python?.length} python`)

    // ── Create the course record ──
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .insert({
        user_id: session.user.id,
        title,
        number: number || null,
        term: startDate ? `${new Date(startDate).getFullYear()}` : null,
        start_date: startDate || null,
        end_date: endDate || null,
        description: parsed.overview?.description || description || null,
        blooms_data: parsed.blooms?.length ? parsed.blooms : null,
        style_profile: null,
        tool_preferences: toolPreferences || null,
      })
      .select()
      .single()

    if (courseError) throw courseError

    const uid = user.id
    const cid = course.id

    // ── Weeks (with readings and description) ──
    if (parsed.weeksWithReadings?.length) {
      await supabase.from('weeks').insert(
        parsed.weeksWithReadings.map(w => ({
          course_id: cid,
          user_id: uid,
          week_number: w.week_number,
          topic: w.topic,
          dates: '',
          week_description: w.description || '',
          concept_overview: w.concept_overview || '',
          readings: w.readings || [],
          assignments: w.assignments_due || [],
          tags: [],
        }))
      )
    }

    // ── Assignments ──
    if (parsed.assignments?.length) {
      const { error: asgError } = await supabase.from('assignments').insert(
        parsed.assignments.map((a, i) => ({
          course_id: cid,
          user_id: uid,
          title: a.title,
          type: a.type,
          points: a.points,
          week: a.week,
          due_date: a.due_date || null,
          description: a.description,
          sort_order: i,
        }))
      )
      if (asgError) console.error('assignments insert error:', asgError)
    }

    // ── Real-world items ──
    if (parsed.realworld?.length) {
      const { error: rwError } = await supabase.from('realworld_items').insert(
        parsed.realworld.map(r => ({
          course_id: cid,
          user_id: uid,
          title: r.title,
          source: r.source,
          description: r.description,
          week: r.week,
        }))
      )
      if (rwError) console.error('realworld insert error:', rwError)
    }

    // ── Python activities ──
    if (parsed.python?.length) {
      const { error: pyError } = await supabase.from('python_activities').insert(
        parsed.python.map(p => ({
          course_id: cid,
          user_id: uid,
          title: p.title,
          week: p.week,
          description: p.description,
          code: p.code,
        }))
      )
      if (pyError) console.error('python insert error:', pyError)
    }

    // Build a human-readable summary to display in the UI
    const summary = buildSummary(parsed)

    return NextResponse.json({
      text: summary,
      parsedData: parsed,
      courseId: course.id,
      counts: {
        weeks: parsed.weeks?.length || 0,
        assignments: parsed.assignments?.length || 0,
        realworld: parsed.realworld?.length || 0,
        python: parsed.python?.length || 0,
      },
    })
  } catch (err: any) {
    console.error('generate error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function buildSummary(parsed: ReturnType<typeof parseGenerationResponse>): string {
  const lines: string[] = []

  if (parsed.overview) {
    lines.push(`### Course Overview\n${parsed.overview.description}\n`)
    if (parsed.overview.outcomes?.length) {
      lines.push('**Learning Outcomes:**')
      parsed.overview.outcomes.forEach(o => lines.push(`- ${o}`))
      lines.push('')
    }
    if (parsed.overview.tools?.length) {
      lines.push(`**Required Tools:** ${parsed.overview.tools.join(', ')}\n`)
    }
  }

  if (parsed.weeks?.length) {
    lines.push(`### Schedule — ${parsed.weeks.length} Weeks Generated`)
    parsed.weeks.slice(0, 5).forEach(w => lines.push(`- **Week ${w.week}:** ${w.topic}`))
    if (parsed.weeks.length > 5) lines.push(`- *…and ${parsed.weeks.length - 5} more weeks*`)
    lines.push('')
  }

  if (parsed.assignments?.length) {
    lines.push(`### Assignments — ${parsed.assignments.length} Created`)
    parsed.assignments.forEach(a => lines.push(`- **${a.title}** (${a.type}, ${a.points} pts) — ${a.week}`))
    lines.push('')
  }

  if (parsed.realworld?.length) {
    lines.push(`### Real-World Examples — ${parsed.realworld.length} Injected`)
    parsed.realworld.slice(0, 3).forEach(r => lines.push(`- **${r.title}** | ${r.source} → ${r.week}`))
    lines.push('')
  }

  if (parsed.python?.length) {
    lines.push(`### Python Activities — ${parsed.python.length} Generated`)
    parsed.python.forEach(p => lines.push(`- **${p.title}** (${p.week})`))
  }

  return lines.join('\n')
}
