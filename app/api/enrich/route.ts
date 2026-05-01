import { NextRequest } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'
import { anthropic, MODEL, extractJSON, buildToolContext } from '@/lib/ai'
import type { EnrichRequest, EnrichWeekResult } from '@/types'

export const maxDuration = 300

function sse(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: Record<string, unknown>) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
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
This week: ${params.topic}
Week description: ${params.weekDescription || 'Not provided'}
Assignments already due this week: ${params.existingAssignments.join(', ') || 'None'}

Return ONLY a JSON object (nothing before { or after }):
{
  "concept_overview": "3-4 sentence foundational explanation of the core concept this week, written for a student encountering it for the first time. Explain the key idea, why it matters, and how it connects to the course arc.",
  "assignments": ${params.options.assignments ? `[{"title":"Name","type":"Lab|Discussion|Reflection|Project|Quiz","points":50,"week":"Week ${params.weekNumber}","due_date":"End of Week ${params.weekNumber}","description":"4+ sentence instructions: task, deliverables, submission, grading — specific to '${params.topic}'"}]` : '[]'},
  "readings": ${params.options.readings ? `["Specific Author Title Chapter or URL relevant to ${params.topic}","Another specific reading"]` : '[]'},
  "reinforcement_materials": ${params.options.reinforcement ? `[{"type":"video|article|tool|dataset|exercise|documentation","title":"Real resource title","url":"https://real-url.com","description":"How this helps students understand ${params.topic}"}]` : '[]'},
  "realworld": ${params.options.realworld ? `[{"title":"Real 2024-2026 example","source":"Source name","url":"https://real-url.com","description":"How this connects to ${params.topic}","week":"Week ${params.weekNumber}"}]` : '[]'}
}

Rules:
- 1-2 items per section max
- Assignments must be specific to "${params.topic}" — not generic
- Use REAL URLs (YouTube, GitHub, government portals, official docs) for reinforcement and realworld
- Readings must be specific titles — never "Chapter 3" or "Recommended textbook"
- JSON only. Start with {. End with }.`
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const supabase = createRouteClient()
        const { data: { user }, error: authErr } = await supabase.auth.getUser()

        if (authErr || !user) {
          sse(controller, encoder, { type: 'error', message: 'Unauthorized' })
          controller.close()
          return
        }

        const body: EnrichRequest = await req.json()
        const { courseId, options } = body

        const { data: course, error: courseErr } = await supabase
          .from('courses')
          .select('*, weeks(*), assignments(*), realworld_items(*)')
          .eq('id', courseId)
          .single()

        if (courseErr || !course) {
          sse(controller, encoder, { type: 'error', message: 'Course not found' })
          controller.close()
          return
        }

        const weeks = (course.weeks || []).sort((a: any, b: any) => a.week_number - b.week_number)

        if (!weeks.length) {
          sse(controller, encoder, { type: 'error', message: 'No weeks found. Generate the course schedule first.' })
          controller.close()
          return
        }

        const allTopics = weeks.map((w: any) => `Wk${w.week_number}: ${w.topic}`).join(' | ')
        const styleProfile = course.style_profile
          ? `${course.style_profile.chips?.join(', ')} — ${course.style_profile.description}`
          : 'Professional academic voice'

        sse(controller, encoder, { type: 'start', total: weeks.length, message: `Enriching ${weeks.length} weeks…` })

        for (let i = 0; i < weeks.length; i++) {
          const week = weeks[i] as any

          sse(controller, encoder, {
            type: 'progress', weekNumber: week.week_number,
            weekIndex: i, total: weeks.length, topic: week.topic,
            message: `Week ${week.week_number}: ${week.topic}`,
          })

          const existingForWeek = (course.assignments || [])
            .filter((a: any) => a.week === `Week ${week.week_number}`)
            .map((a: any) => a.title)

          try {
            const response = await anthropic.messages.create({
              model: MODEL,
              max_tokens: 1200,
              system: `You are CourseForge AI. Respond with a JSON object only — no markdown fences, no text before { or after }.${buildToolContext(body.toolPreferences)}`,
              messages: [{
                role: 'user',
                content: buildWeekPrompt({
                  weekNumber: week.week_number,
                  topic: week.topic || `Week ${week.week_number}`,
                  weekDescription: week.week_description,
                  courseTitle: course.title,
                  courseDescription: course.description,
                  styleProfile,
                  existingAssignments: existingForWeek,
                  allTopics,
                  options,
                }),
              }],
            })

            const raw = response.content.find((b: any) => b.type === 'text')?.text || '{}'
            let weekData: any = { assignments: [], readings: [], reinforcement_materials: [], realworld: [] }
            try {
              weekData = JSON.parse(extractJSON(raw))
            } catch (parseErr) {
              console.error(`Week ${week.week_number} parse error. Raw:`, raw.slice(0, 300))
            }

            // Persist week updates
            const weekUpdates: Record<string, any> = {}
            if (weekData.concept_overview) weekUpdates.concept_overview = weekData.concept_overview
            if (options.readings && weekData.readings?.length) weekUpdates.readings = weekData.readings
            if (options.reinforcement && weekData.reinforcement_materials?.length) weekUpdates.reinforcement_materials = weekData.reinforcement_materials
            if (Object.keys(weekUpdates).length > 0) {
              await supabase.from('weeks').update(weekUpdates).eq('id', week.id)
            }

            // Insert new assignments
            if (options.assignments && weekData.assignments?.length) {
              const currentCount = (course.assignments || []).length
              await supabase.from('assignments').insert(
                weekData.assignments.map((a: any, idx: number) => ({
                  course_id: courseId, user_id: user.id,
                  title: a.title, type: a.type || 'Assignment',
                  points: Number(a.points) || 0, week: a.week || `Week ${week.week_number}`,
                  due_date: a.due_date || null, description: a.description || '',
                  sort_order: currentCount + idx,
                }))
              )
            }

            // Replace real-world items for this week
            if (options.realworld && weekData.realworld?.length) {
              await supabase.from('realworld_items')
                .delete().eq('course_id', courseId).eq('week', `Week ${week.week_number}`)
              await supabase.from('realworld_items').insert(
                weekData.realworld.map((r: any) => ({
                  course_id: courseId, user_id: user.id,
                  title: r.title, source: r.source, url: r.url || null,
                  description: r.description, week: r.week || `Week ${week.week_number}`,
                }))
              )
            }

            const result: EnrichWeekResult = {
              weekId: week.id, weekNumber: week.week_number, topic: week.topic,
              assignments: weekData.assignments || [],
              readings: weekData.readings || [],
              reinforcement_materials: weekData.reinforcement_materials || [],
              realworld: weekData.realworld || [],
            }

            sse(controller, encoder, { type: 'week_complete', result })

          } catch (weekErr: any) {
            console.error(`Enrich week ${week.week_number} error:`, weekErr.message)
            sse(controller, encoder, { type: 'week_error', weekNumber: week.week_number, topic: week.topic, message: weekErr.message })
          }

          // Respect rate limits
          if (i < weeks.length - 1) await new Promise(r => setTimeout(r, 500))
        }

        sse(controller, encoder, { type: 'complete', message: `Enrichment complete — ${weeks.length} weeks processed` })

      } catch (err: any) {
        console.error('Enrich route error:', err)
        sse(controller, encoder, { type: 'error', message: err.message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  })
}
