import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'
import { extractJSON, buildToolContext } from '@/lib/ai'
import { callAI } from '@/lib/ai-provider'
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
  existingReadings: string[]
  existingResources: string[]
  options: EnrichRequest['options']
  toolPreferences?: any
}

function stripHTML(html: string): string {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim()
}

function buildWeekPrompt(params: {
  weekNumber: number; topic: string; weekDescription: string | null
  courseTitle: string; courseDescription: string | null; styleProfile: string
  existingAssignments: string[]; existingReadings: string[]; existingResources: string[]
  allTopics: string; options: EnrichRequest['options']
}): string {
  const year = new Date().getFullYear()

  const existingContext = [
    params.existingAssignments.length ? `Assignments already in this week: ${params.existingAssignments.join(', ')}` : '',
    params.existingReadings.length ? `Readings already in this week: ${params.existingReadings.slice(0, 3).join('; ')}` : '',
    params.existingResources.length ? `Resources already in this week: ${params.existingResources.slice(0, 2).join('; ')}` : '',
  ].filter(Boolean).join('\n')

  return `You are building a complete, student-ready week for a university course. Fill EVERY section below — do not leave any empty.

Course: "${params.courseTitle}"
Week ${params.weekNumber}: ${params.topic}
Course arc: ${params.allTopics}
Teaching style: ${params.styleProfile}
${params.courseDescription ? `Course description: ${params.courseDescription}` : ''}
${existingContext ? `\nAlready exists (do not duplicate):\n${existingContext}` : ''}

The 6-step learning flow for this week must be completely populated:
  Step 1 — Concept Overview: what students read FIRST to understand the topic
  Step 2 — Readings: specific texts to study
  Step 3 — Resources & Videos: videos, tools, datasets to reinforce understanding
  Step 4 — Activities & Labs: hands-on practice before they submit
  Step 5 — Discussions: peer reflection AFTER engaging with content
  Step 6 — Graded Assignments: what they submit to demonstrate mastery

Return ONLY valid JSON (nothing before { or after }):
{
  "concept_overview": "Write 4-5 sentences a student would read FIRST before doing anything else this week. Explain: (1) what '${params.topic}' is in plain language, (2) why it matters in the real world, (3) how it connects to what they learned previously, (4) what they will be able to DO by the end of this week. Do NOT dump raw HTML or filenames here.",

  "readings": ${params.options.readings
    ? `[
    "Author Last, First. Full Title. Publisher, Year — Chapter X: Chapter Title.",
    "Author Last, First. Full Title. Publisher, Year — Chapter Y: Chapter Title.",
    "Short descriptive label for a third resource relevant to ${params.topic}"
  ]`
    : '[]'},

  "reinforcement_materials": ${params.options.reinforcement
    ? `[
    {"type":"video","title":"Descriptive video title about ${params.topic}","url":"https://www.youtube.com/watch?v=REAL_ID","description":"1-2 sentences on how this video helps students understand ${params.topic} — include who made it and what it covers."},
    {"type":"tool","title":"Real tool or documentation title","url":"https://real-official-url.com","description":"1-2 sentences on how students use this tool for ${params.topic}."}
  ]`
    : '[]'},

  "assignments": ${params.options.assignments
    ? `[
    {
      "title": "Specific lab or activity name for ${params.topic}",
      "type": "Lab",
      "points": 100,
      "week": "Week ${params.weekNumber}",
      "due_date": "End of Week ${params.weekNumber}",
      "description": "Write 4-6 sentences covering: (1) exactly what students DO step by step, (2) what software or tools they use, (3) what they submit and in what format, (4) how it is graded with point breakdown. Make it completely specific to ${params.topic} — no generic filler."
    },
    {
      "title": "Discussion: [specific question about ${params.topic}]",
      "type": "Discussion",
      "points": 25,
      "week": "Week ${params.weekNumber}",
      "due_date": "End of Week ${params.weekNumber}",
      "description": "Write a 3-4 sentence discussion prompt that asks students to connect ${params.topic} to a real-world scenario they can relate to. Include: what to address in their initial post (250-300 words), how many peers to respond to, and the grading criteria breakdown."
    }
  ]`
    : '[]'},

  "realworld": ${params.options.realworld
    ? `[
    {
      "title": "Specific ${year} real-world example title",
      "source": "Organization or publication name",
      "url": "https://real-working-url.com",
      "description": "2 sentences: what happened and exactly how it demonstrates ${params.topic} in practice.",
      "week": "Week ${params.weekNumber}"
    }
  ]`
    : '[]'}
}

Critical rules:
- concept_overview must be readable prose — NEVER raw HTML, never PDF filenames, never URLs
- readings must be real academic/professional citations — author, title, publisher
- reinforcement_materials URLs must be real and working (YouTube, official docs, government sites)  
- assignments must be fully detailed — students should know exactly what to do without asking
- Every section must have content — do NOT return empty arrays if the option is enabled
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
      courseTitle, courseDescription, existingAssignments, existingReadings, existingResources,
      options, toolPreferences } = body

    if (!courseId || !weekId || !weekNumber || !topic) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const toolCtx = buildToolContext(toolPreferences)

    // Strip HTML from week description before sending to AI
    const cleanDescription = weekDescription ? stripHTML(weekDescription) : null

    // ── Load AI provider preference and call AI ──
    let raw = '{}'
    try {
      const { data: profData } = await supabase
        .from('profiles').select('ai_provider, gemini_api_key, gemini_model').eq('id', user.id).single()
      const aiCfg = {
        provider: (profData?.ai_provider || 'claude') as 'claude' | 'gemini',
        geminiApiKey: profData?.gemini_api_key,
        geminiModel: profData?.gemini_model,
      }
      raw = await callAI({
        system: `You are CourseForge AI, an expert university course designer. Your job is to fill ALL 6 steps of the weekly learning flow with complete, high-quality content. Never return empty arrays for enabled sections. Return valid JSON only — no markdown fences.${toolCtx}`,
        prompt: buildWeekPrompt({
          weekNumber, topic,
          weekDescription: cleanDescription,
          courseTitle, courseDescription: courseDescription || null,
          styleProfile, existingAssignments,
          existingReadings: existingReadings || [],
          existingResources: existingResources || [],
          allTopics, options,
        }),
        maxTokens: 2500,
        config: aiCfg,
      }) || '{}'
    } catch (aiErr: any) {
      console.error(`AI error for week ${weekNumber}:`, aiErr.message)
      return NextResponse.json({ error: `AI error: ${aiErr.message}` }, { status: 502 })
    }

    let weekData: any = { assignments: [], readings: [], reinforcement_materials: [], realworld: [] }
    try {
      weekData = JSON.parse(extractJSON(raw))
    } catch (e) {
      console.error(`Parse error for week ${weekNumber}:`, raw.slice(0, 300))
    }

    // Normalize readings to plain strings and filter out garbage from imscc import
    if (Array.isArray(weekData.readings)) {
      weekData.readings = weekData.readings
        .map((r: any) =>
          typeof r === 'string' ? r
            : [r.author, r.title, r.source, r.description].filter(Boolean).join(' — ')
        )
        // Remove strings that are just mangled PDF filenames or too short
        .filter((r: string) => r.length > 10 && !r.match(/^\d+[A-Z]/) && !r.endsWith('.pdf'))
    }

    // Clean concept_overview — strip any HTML that leaked in from imscc import
    if (weekData.concept_overview) {
      weekData.concept_overview = stripHTML(weekData.concept_overview)
      // If it's still garbage (very long URL string or no spaces), clear it
      if (weekData.concept_overview.length < 30 || !weekData.concept_overview.includes(' ')) {
        weekData.concept_overview = null
      }
    }

    // ── Save enrichment history (non-blocking — if table doesn't exist yet, skip silently) ──
    try {
      await supabase.from('week_enrichments').insert({
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
    } catch (histErr: any) {
      // Don't block enrichment if history table doesn't exist
      console.warn('enrichment history skipped:', histErr.message)
    }

    // ── Update the week row ──
    const weekUpdates: Record<string, any> = {}
    if (weekData.concept_overview) weekUpdates.concept_overview = weekData.concept_overview
    if (options.readings && weekData.readings?.length) weekUpdates.readings = weekData.readings
    if (options.reinforcement && weekData.reinforcement_materials?.length) {
      weekUpdates.reinforcement_materials = weekData.reinforcement_materials
    }

    if (Object.keys(weekUpdates).length > 0) {
      // Update by id only — don't filter by user_id since RLS already handles auth
      const { error: updateErr, count } = await supabase
        .from('weeks')
        .update(weekUpdates)
        .eq('id', weekId)
      if (updateErr) {
        console.error('week update error:', updateErr.message, updateErr.code, updateErr.details)
        return NextResponse.json({ error: `Week save failed: ${updateErr.message}` }, { status: 500 })
      }
      console.log(`week ${weekNumber} updated, count:`, count)
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

    console.log(`[enrich-week] Week ${weekNumber} complete — returning result`)
    return NextResponse.json({ result })
  } catch (err: any) {
    console.error('enrich-week unhandled error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
