import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'
import { analyzeStyleProfile } from '@/lib/ai'
import type { AnalyzeRequest } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const session = { user }

    const body: AnalyzeRequest = await req.json()
    if (!body.files?.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const filesContext = body.files
      .map(f => `FILE: "${f.name}" (${f.type.toUpperCase()})\n${f.text}`)
      .join('\n---\n')
      .slice(0, 6000)

    const profile = await analyzeStyleProfile(filesContext)
    return NextResponse.json({ profile })
  } catch (err: any) {
    console.error('analyze error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
