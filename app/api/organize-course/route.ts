import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'

// ── Announcement patterns — these are instructor posts, not student work ──
const ANNOUNCEMENT_PATTERNS = [
  /\bis (up|now available|live|posted|ready)\b/i,
  /\binformation\b/i,
  /congratulations/i,
  /^rest of the/i,
  /notebook is up/i,
  /apolog(y|ies|ize)/i,
  /^update[:\s]/i,
  /\breminder\b/i,
  /tasks? for the (rest|remainder)/i,
  /^(hi|hello|greetings) (all|everyone|class)/i,
  /^(a\s+)?quick (note|reminder|update)/i,
]

function isAnnouncement(title: string): boolean {
  return ANNOUNCEMENT_PATTERNS.some(p => p.test(title))
}

function inferType(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('lab') || t.includes('notebook') || t.includes('colab') || t.includes('exercise') || t.includes('activity')) return 'Lab'
  if (t.includes('discussion') || t.includes('forum') || t.includes('post') || t.includes('reply') || t.includes('respond')) return 'Discussion'
  if (t.includes('reflection') || t.includes('journal') || t.includes('response') || t.includes('reflection')) return 'Reflection'
  if (t.includes('project') || t.includes('proposal') || t.includes('final') || t.includes('dossier') || t.includes('portfolio') || t.includes('capstone')) return 'Project'
  if (t.includes('quiz') || t.includes('exam') || t.includes('test') || t.includes('assessment') || t.includes('check')) return 'Quiz'
  return 'Assignment'
}

// Find the best-matching week for an assignment based on title similarity
function findBestWeek(assignmentTitle: string, weeks: any[]): string | null {
  const title = assignmentTitle.toLowerCase()

  // Exact number match: "Dossier 1" → look for week with "1" in topic
  const numMatch = title.match(/\b(\d+)\b/)
  if (numMatch) {
    const num = numMatch[1]
    const weekByNum = weeks.find(w =>
      w.topic?.toLowerCase().includes(`dossier ${num}`) ||
      w.topic?.toLowerCase().includes(`module ${num}`) ||
      w.topic?.toLowerCase().includes(`week ${num}`) ||
      w.topic?.toLowerCase().includes(`part ${num}`)
    )
    if (weekByNum) return `Week ${weekByNum.week_number}`
  }

  // Topic keyword overlap
  const titleWords = title.split(/\s+/).filter(w => w.length > 4)
  let bestScore = 0
  let bestWeek: any = null

  for (const week of weeks) {
    const weekTopic = (week.topic || '').toLowerCase()
    let score = 0
    for (const word of titleWords) {
      if (weekTopic.includes(word)) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestWeek = week
    }
  }

  if (bestScore > 0 && bestWeek) return `Week ${bestWeek.week_number}`
  return null
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { courseId } = await req.json()
    if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 })

    // Load all assignments and weeks for this course
    const [{ data: assignments }, { data: weeks }] = await Promise.all([
      supabase.from('assignments').select('*').eq('course_id', courseId).order('sort_order'),
      supabase.from('weeks').select('id, week_number, topic').eq('course_id', courseId).order('week_number'),
    ])

    if (!assignments || !weeks) {
      return NextResponse.json({ error: 'Could not load course data' }, { status: 500 })
    }

    const removed: string[] = []
    const reclassified: string[] = []
    const remapped: string[] = []

    for (const assignment of assignments) {
      const title = assignment.title || ''
      const updates: Record<string, any> = {}

      // 1. Check if this is an announcement — delete it
      if (isAnnouncement(title)) {
        await supabase.from('assignments').delete().eq('id', assignment.id)
        removed.push(title)
        continue
      }

      // 2. Reclassify type if wrong or missing
      const correctType = inferType(title)
      if (!assignment.type || assignment.type === 'Assignment' && correctType !== 'Assignment') {
        updates.type = correctType
        reclassified.push(`${title} → ${correctType}`)
      }

      // 3. Remap to correct week if week is missing or "Week 1" (default placeholder)
      if (weeks.length > 1) {
        const currentWeek = assignment.week
        const shouldRemap = !currentWeek ||
          (currentWeek === 'Week 1' && weeks.length > 1 && !/week\s*1\b/i.test(title))

        if (shouldRemap) {
          const bestWeek = findBestWeek(title, weeks)
          if (bestWeek && bestWeek !== currentWeek) {
            updates.week = bestWeek
            remapped.push(`${title}: ${currentWeek || 'none'} → ${bestWeek}`)
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from('assignments').update(updates).eq('id', assignment.id)
      }
    }

    return NextResponse.json({
      removed: removed.length,
      reclassified: reclassified.length,
      remapped: remapped.length,
      details: { removed, reclassified, remapped },
    })
  } catch (err: any) {
    console.error('organize-course error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
