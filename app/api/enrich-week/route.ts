import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'
import { anthropic, MODEL, extractJSON, buildToolContext } from '@/lib/ai'
import type { EnrichRequest, EnrichWeekResult } from '@/types'

interface EnrichWeekRequest {
  courseId: string
  weekId: string
  weekNumber: number
  topic: string
  weekDescription?: string | null
  allTopics: string
  styleProfile: string
  courseTitle: string
  courseDescription?: string | null
  existingAssignments: string[]
  options: EnrichRequest['options']
  toolPreferences?: any
}

function buildWeekPrompt(params: {
  weekNumber: number; topic: string; weekDescription: string | null
  courseTitle: string; courseDescription: string | null; styleProfile: string
  existingAssignments: string[]; allTopics: string; options: EnrichRequest['options']
}): string {
  return `Enrich Week ${params.weekNumber} of "${params.courseTitle}".
Course description: ${params.courseDescription || 'Not provided'}
Teaching style: ${params.styleProfile}
Full course arc: ${params.allTopics}
This week topic: ${params.topic}
Week description: ${params.weekDescription || 'Not provided'}
Assignments already due: ${params.existingAssignments.join(', ') || 'None'}

Return ONLY a JSON object (nothing before { or after }):
{
  "concept_overview": "3-4 sentence foundational explanation for a student encountering '${params.topic}' for the first time. Explain the core idea, why it matters, and how it builds on prior topics.",
  "assignments": ${params.options.assignments
    ? `[{"title":"Specific assignment name","type":"Lab|Discussion|Reflection|Project|Quiz","points":50,"week":"Week ${params.weekNumber}","due_date":"End of Week ${params.weekNumber}","description":"4+ sentence instructions covering task, deliverables, submission format, and grading criteria — all specific to '${params.topic}'"}]`
    : '[]'},
  "readings": ${params.options.readings
    ? `["Author Last, First. Title. Publisher, Year — Chapter/Section.", "Another specific citation on one line"]`
    : '[]'},
  "reinforcement_materials": ${params.options.reinforcement
    ? `[{"type":"video|article|tool|dataset|exercise|documentation","title":"Real resource title","url":"https://real-working-url.com","description":"1-2 sentences explaining how this helps students understand ${params.topic}"}]`
    : '[]'},
  "realworld": ${params.options.realworld
    ? `[{"title":"Specific 2024-2026 example","source":"Source name","url":"https://real-url.com","description":"2 sentences connecting this to ${params.topic}","week":"Week ${params.weekNumber}"}]`
    : '[]'}
}

Rules:
- 1-2 items per section max
- Assignments MUST be specific to "${params.topic}" — not generic filler
- Readings MUST be plain strings (not objects) — one citation per line
- URLs must be real (YouTube, GitHub, USGS, Census.gov, official docs)
- JSON only. Start with {. End with }.`
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: EnrichWeekRequest
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { courseId, weekId, weekNumber, topic, weekDescription, allTopics, styleProfile,
      courseTitle, courseDescription, existingAssignments, options, toolPreferences } = body

    if (!courseId || !weekId || !weekNumber || !topic) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const toolCtx = buildToolContext(toolPreferences)

    // ── Call Claude ──
    let raw = '{}'
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system: `You are CourseForge AI. Respond with a JSON object only — no markdown fences, no text before { or after }.${toolCtx}`,
        messages: [{
          role: 'user',
          content: buildWeekPrompt({ weekNumber, topic, weekDescription: weekDescription || null,
            courseTitle, courseDescription: courseDescription || null, styleProfile,
            existingAssignments, allTopics, options }),
        }],
      })
      raw = (response.content.find(b => b.type === 'text') as any)?.text || '{}'
    } catch (claudeErr: any) {
      console.error(`Claude error for week ${weekNumber}:`, claudeErr.message)
      return NextResponse.json({ error: `AI error: ${claudeErr.message}` }, { status: 502 })
    }

    let weekData: any = { assignments: [], readings: [], reinforcement_materials: [], realworld: [] }
    try {
      weekData = JSON.parse(extractJSON(raw))
    } catch (e) {
      console.error(`Parse error for week ${weekNumber}:`, raw.slice(0, 300))
    }

    // Normalize readings to plain strings
    if (Array.isArray(weekData.readings)) {
      weekData.readings = weekData.readings.map((r: any) =>
        typeof r === 'string' ? r
          : [r.author, r.title, r.source, r.description].filter(Boolean).join(' — ')
      )
    }

    // ── Save enrichment history FIRST (always, regardless of what options are chosen) ──
    const { error: histErr } = await supabase.from('week_enrichments').insert({
      course_id: courseId,
      week_id: weekId,
      user_id: user.id,
      week_number: weekNumber,
      topic,
      concept_overview: weekData.concept_overview || null,
      assignments: weekData.assignments || [],
      readings: weekData.readings || [],
      reinforcement_materials: weekData.reinforcement_materials || [],
      realworld: weekData.realworld || [],
    })
    if (histErr) console.error('enrichment history save error:', histErr.message)

    // ── Update the week row ──
    const weekUpdates: Record<string, any> = {}
    if (weekData.concept_overview) weekUpdates.concept_overview = weekData.concept_overview
    if (options.readings && weekData.readings?.length) weekUpdates.readings = weekData.readings
    if (options.reinforcement && weekData.reinforcement_materials?.length) {
      weekUpdates.reinforcement_materials = weekData.reinforcement_materials
    }

    if (Object.keys(weekUpdates).length > 0) {
      const { error: updateErr } = await supabase
        .from('weeks')
        .update(weekUpdates)
        .eq('id', weekId)
        .eq('user_id', user.id)  // explicit RLS match
      if (updateErr) {
        console.error('week update error:', updateErr.message, updateErr.code)
        // Don't fail the whole request — assignments and realworld may still save
      }
    }

    // ── Insert new assignments ──
    if (options.assignments && weekData.assignments?.length) {
      const { data: existing } = await supabase
        .from('assignments').select('id').eq('course_id', courseId)
      const currentCount = existing?.length || 0
      const { error: asgErr } = await supabase.from('assignments').insert(
        weekData.assignments.map((a: any, idx: number) => ({
          course_id: courseId, user_id: user.id,
          title: a.title, type: a.type || 'Assignment',
          points: Number(a.points) || 0,
          week: a.week || `Week ${weekNumber}`,
          due_date: a.due_date || null,
          description: a.description || '',
          sort_order: currentCount + idx,
        }))
      )
      if (asgErr) console.error('assignment insert error:', asgErr.message)
    }

    // ── Replace real-world items for this week ──
    if (options.realworld && weekData.realworld?.length) {
      await supabase.from('realworld_items')
        .delete().eq('course_id', courseId).eq('week', `Week ${weekNumber}`)
      const { error: rwErr } = await supabase.from('realworld_items').insert(
        weekData.realworld.map((r: any) => ({
          course_id: courseId, user_id: user.id,
          title: r.title, source: r.source, url: r.url || null,
          description: r.description, week: r.week || `Week ${weekNumber}`,
        }))
      )
      if (rwErr) console.error('realworld insert error:', rwErr.message)
    }

    const result: EnrichWeekResult = {
      weekId, weekNumber, topic,
      assignments: weekData.assignments || [],
      readings: weekData.readings || [],
      reinforcement_materials: weekData.reinforcement_materials || [],
      realworld: weekData.realworld || [],
    }

    return NextResponse.json({ result })
  } catch (err: any) {
    console.error('enrich-week unhandled error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
