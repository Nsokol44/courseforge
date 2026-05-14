import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'
import { callAI } from '@/lib/ai-provider'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const {
      assignmentId,
      title,
      type,
      points,
      week,
      description,
      courseTitle,
      courseNumber,
      styleProfile,
      toolPreferences,
      enhanceMode, // 'update' | 'expand' | 'rubric' | 'modernize'
    } = await req.json()

    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

    const year = new Date().getFullYear()
    const toolCtx = toolPreferences
      ? `\nTools: ${[
          toolPreferences.python_env !== 'None' && toolPreferences.python_env,
          toolPreferences.gis_software !== 'None' && toolPreferences.gis_software,
          toolPreferences.submission_format,
        ].filter(Boolean).join(', ')}`
      : ''

    const styleCtx = styleProfile
      ? `\nTeaching style: ${styleProfile.chips?.join(', ')} — ${styleProfile.description}`
      : ''

    const modeInstructions: Record<string, string> = {
      update: `Update this assignment for ${year}. Specifically:
- Replace any dated examples, datasets, or case studies with current ${year} equivalents
- Update due dates and year references
- Refresh data sources to point to current versions (Census 2020+, recent Landsat data, 2024-2025 news events)
- Keep the same learning objectives, point value, and structure
- Maintain the professor's voice exactly`,

      expand: `Expand this assignment with more detail and clarity. Specifically:
- Add a clear step-by-step task breakdown (numbered list of exactly what to do)
- Add explicit deliverables list (what to submit, in what format)
- Add a grading rubric with point breakdown that adds to ${points} total points
- Add a "Getting Started" tip for students who feel stuck
- Keep the same learning objectives and maintain the professor's voice`,

      rubric: `Rewrite this assignment focused on rubric clarity. Specifically:
- Keep the task description but restructure with clear sections: Overview, Tasks, Deliverables, Grading
- Create an explicit rubric table showing how ${points} points are allocated across criteria
- Each criterion should have: criterion name, points, and what "full credit" looks like
- Add a note about what constitutes acceptable late work or partial credit
- Maintain the professor's voice exactly`,

      modernize: `Modernize this assignment with current tools and real-world context. Specifically:
- Update to reference current software versions and tools (${toolPreferences?.python_env || 'current GIS tools'})
- Add 1-2 specific 2024-2025 real-world datasets or news events as context
- Where applicable, add an option to submit via ${toolPreferences?.submission_format || 'Canvas'}
- Add a brief real-world "Why this matters" framing paragraph at the start
- Keep the same learning objectives and point value`,
    }

    const instruction = modeInstructions[enhanceMode || 'update'] || modeInstructions.update

    const prompt = `You are enhancing an assignment for a university course.

Course: ${courseTitle}${courseNumber ? ` (${courseNumber})` : ''}
Assignment: ${title}
Type: ${type || 'Assignment'}
Points: ${points || 0}
Week: ${week || 'not specified'}${styleCtx}${toolCtx}

CURRENT ASSIGNMENT DESCRIPTION:
${description || '(No description yet — write a complete assignment from scratch based on the title and type)'}

ENHANCEMENT REQUEST:
${instruction}

Return a JSON object only (no markdown fences, no text outside braces):
{
  "title": "Updated title (keep same or improve clarity)",
  "description": "Full enhanced assignment description — complete, detailed, ready to use",
  "type": "${type || 'Assignment'}",
  "points": ${points || 0},
  "changes_summary": "2-3 sentence summary of what was changed and why"
}`

    // Load AI provider preference
    const { data: profData } = await supabase
      .from('profiles')
      .select('ai_provider, gemini_api_key, gemini_model')
      .eq('id', user.id)
      .single()

    const aiConfig = {
      provider: (profData?.ai_provider || 'claude') as 'claude' | 'gemini',
      geminiApiKey: profData?.gemini_api_key,
      geminiModel: profData?.gemini_model,
    }

    const raw = await callAI({
      system: `You are CourseForge AI, an expert university course designer. 
Enhance assignments to be clearer, more current, and more actionable while preserving the professor's voice.
Return valid JSON only — no markdown fences, no text outside the JSON object.`,
      prompt,
      maxTokens: 2000,
      config: aiConfig,
    })

    // Parse response
    let enhanced: any
    try {
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
      enhanced = JSON.parse(cleaned)
    } catch {
      const firstBrace = raw.indexOf('{')
      if (firstBrace === -1) return NextResponse.json({ error: 'AI returned unparseable response' }, { status: 422 })
      try { enhanced = JSON.parse(raw.slice(firstBrace)) }
      catch { return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 422 }) }
    }

    // Optionally save directly if assignmentId provided
    if (assignmentId && enhanced.description) {
      const { error: saveErr } = await supabase
        .from('assignments')
        .update({
          title: enhanced.title || title,
          description: enhanced.description,
        })
        .eq('id', assignmentId)
        .eq('user_id', user.id)
      if (saveErr) console.error('enhance-assignment save error:', saveErr.message)
    }

    return NextResponse.json({ enhanced })
  } catch (err: any) {
    console.error('enhance-assignment error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
