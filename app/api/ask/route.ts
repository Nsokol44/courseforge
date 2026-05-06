import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'
import { MAX_TOKENS, buildSystemPrompt, buildToolContext, parseAIResponse, QUICK_PROMPTS } from '@/lib/ai'
import { callAI } from '@/lib/ai-provider'
import type { AIProviderConfig } from '@/lib/ai-provider'
import type { AskRequest } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = { user }

    const body: AskRequest = await req.json()
    const { prompt, courseContext } = body

    if (!prompt) return NextResponse.json({ error: 'No prompt provided' }, { status: 400 })

    // Resolve quick-action aliases
    const resolvedPrompt = QUICK_PROMPTS[prompt] || prompt

    // Load tool preferences AND uploaded file content for this course
    const { data: courseData } = await supabase
      .from('courses')
      .select('tool_preferences')
      .eq('id', body.courseId)
      .single()

    const { data: courseFiles } = await supabase
      .from('course_files')
      .select('filename, file_type, extracted_text')
      .eq('course_id', body.courseId)
      .limit(6)

    // Build file context to append to the system prompt
    const fileContext = courseFiles?.length
      ? '\n\nUploaded course materials (use as reference):\n' +
        courseFiles.map(f => `--- ${f.filename} (${f.file_type?.toUpperCase()}) ---\n${f.extracted_text || '[binary file — no text extracted]'}`).join('\n\n').slice(0, 3000)
      : ''

    const systemPrompt = buildSystemPrompt(courseContext, courseData?.tool_preferences) + fileContext

    // Load AI provider preference
    const { data: profileData } = await supabase
      .from('profiles')
      .select('ai_provider, gemini_api_key, gemini_model')
      .eq('id', user.id)
      .single()
    const aiConfig = {
      provider: (profileData?.ai_provider || 'claude') as 'claude' | 'gemini',
      geminiApiKey: profileData?.gemini_api_key,
      geminiModel: profileData?.gemini_model,
    }

    const text = await callAI({ system: systemPrompt, prompt: resolvedPrompt, maxTokens: MAX_TOKENS, config: aiConfig }) || 'No response.'
    const parsedData = parseAIResponse(text, resolvedPrompt)

    return NextResponse.json({ text, parsedData })
  } catch (err: any) {
    console.error('ask error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
