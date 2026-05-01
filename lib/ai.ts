import Anthropic from '@anthropic-ai/sdk'
import type { CourseContext, ParsedAIData, BloomLevel, StyleProfile, ToolPreferences } from '@/types'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export const MODEL = 'claude-sonnet-4-5'
export const MAX_TOKENS = 4000

// ─────────────────────────────────────────
// Robust JSON extractor
// ─────────────────────────────────────────
export function extractJSON(raw: string): string {
  if (!raw?.trim()) return '{}'
  const jsonFence = raw.match(/```json\s*([\s\S]*?)```/)
  if (jsonFence) return jsonFence[1].trim()
  const anyFence = raw.match(/```(?:\w*)\s*([\s\S]*?)```/)
  if (anyFence) {
    const inner = anyFence[1].trim()
    if (inner.startsWith('{') || inner.startsWith('[')) return inner
  }
  const firstBrace = raw.search(/[{[]/)
  if (firstBrace !== -1) {
    const opener = raw[firstBrace]
    const closer = opener === '{' ? '}' : ']'
    let depth = 0, inString = false, escape = false
    for (let i = firstBrace; i < raw.length; i++) {
      const ch = raw[i]
      if (escape) { escape = false; continue }
      if (ch === '\\' && inString) { escape = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === opener) depth++
      if (ch === closer) { depth--; if (depth === 0) return raw.slice(firstBrace, i + 1) }
    }
  }
  return raw.trim()
}

// ─────────────────────────────────────────
// Tool context injector
// ─────────────────────────────────────────
export function buildToolContext(prefs: ToolPreferences | null | undefined): string {
  if (!prefs) return ''
  const lines: string[] = []
  if (prefs.python_env && prefs.python_env !== 'None') lines.push(`Python environment: ${prefs.python_env}`)
  if (prefs.submission_format) lines.push(`Submission format: ${prefs.submission_format}`)
  if (prefs.gis_software && prefs.gis_software !== 'None') lines.push(`GIS software: ${prefs.gis_software}`)
  if (prefs.lms) lines.push(`LMS: ${prefs.lms}`)
  if (prefs.custom_tools?.length) lines.push(`Additional tools: ${prefs.custom_tools.join(', ')}`)
  if (prefs.constraints) lines.push(`Constraints: ${prefs.constraints}`)
  return lines.length
    ? '\n\nTool requirements (follow strictly in all assignments and activities):\n' + lines.map(l => '- ' + l).join('\n')
    : ''
}

// ─────────────────────────────────────────
// System prompt for /api/ask
// ─────────────────────────────────────────
export function buildSystemPrompt(ctx: CourseContext, toolPrefs?: ToolPreferences | null): string {
  const sp = ctx.styleProfile
  return `You are CourseForge AI, an expert higher education course designer.

Professor: ${ctx.professorName} | Institution: ${ctx.institution} | Dept: ${ctx.department}
Course: ${ctx.title} (${ctx.number || 'no number'}) — ${ctx.term || 'no term'} | Points: ${ctx.points || 'not set'}
Source files: ${ctx.fileNames.join(', ') || 'none uploaded'}

Teaching Style:
${sp ? `Traits: ${sp.chips.join(', ')}\n${sp.description}` : 'Professional academic voice.'}

Schedule (${ctx.weeks.length} weeks): ${ctx.weeks.length ? ctx.weeks.map(w => `Wk${w.week_number}: ${w.topic}`).join('; ') : 'None yet'}
Assignments (${ctx.assignments.length}): ${ctx.assignments.length ? ctx.assignments.map(a => `${a.title}(${a.type},${a.points}pts)`).join('; ') : 'None yet'}

Respond with clear markdown: ### headers, **bold**, bullet points. Be specific and actionable.${buildToolContext(toolPrefs)}`
}

// ─────────────────────────────────────────
// Quick prompts — all return parseable structured output
// ─────────────────────────────────────────
export const QUICK_PROMPTS: Record<string, string> = {
  critique: `Critically analyze this course. For each point, reference specific assignment names or week numbers.

Cover:
### Bloom's Taxonomy Gaps
Which cognitive levels are missing or weak, and which assignments address each level.

### Rubric & Clarity Issues
Which assignments have vague instructions or missing grading criteria.

### Scaffolding Weaknesses
Where concepts are introduced without adequate preparation or follow-through.

### Real-World Relevance Opportunities
Specific weeks where connecting to current events or datasets would strengthen learning.

### Recommendations
3-5 prioritised, actionable changes.`,

  bloom: `Map every assignment in this course to Bloom's Taxonomy levels (Remember, Understand, Apply, Analyze, Evaluate, Create).

For each level:
- List which assignments address it
- Give a coverage score 0-100 based on depth and frequency
- Explain what is strong and what is missing

After your analysis, output this exact JSON block (nothing before or after the fence):
\`\`\`json
[{"level":"Remember","score":65,"color":"#ef4444"},{"level":"Understand","score":78,"color":"#f97316"},{"level":"Apply","score":90,"color":"#eab308"},{"level":"Analyze","score":82,"color":"#22c55e"},{"level":"Evaluate","score":58,"color":"#3b82f6"},{"level":"Create","score":75,"color":"#a855f7"}]
\`\`\``,

  realworld: `For each week of this course, suggest 1-2 specific 2024–2026 real-world examples directly tied to that week's topic.

Format every item exactly as:
**Title** | Source name | 2-sentence description of what it is and why it connects | Week N

Include live datasets, recent news events, open APIs, and published case studies. Be specific — include publication names and dates where possible.`,

  python: `Generate a complete interactive Python activity for this course. Include:

### Learning Objective
One sentence tied to a specific week's topic.

### Setup
What library to use and why (GeoPandas, Rasterio, Folium, etc.). Include any install instructions if needed.

### Starter Code
\`\`\`python
# Full Colab-ready starter code with intentional gaps marked # YOUR CODE HERE
\`\`\`

### Guided Questions
3 questions students answer as they work through the activity.

### Extension Challenge
One harder task for students who finish early.`,

  pacing: `Review the week-by-week pacing of this course.

### Cognitive Load Issues
Flag any weeks with too many new concepts introduced simultaneously.

### Sequencing Problems
Identify any concepts that appear before their prerequisites.

### Assignment Clustering
Point out weeks where multiple due dates create unnecessary pressure.

### Suggested Rebalancing
Provide a revised week-by-week outline if significant changes are warranted.`,

  improve: `You are going to rewrite the 2 weakest assignments in this course.

For each assignment:

**ORIGINAL:**
Copy the original assignment title and full description verbatim.

**IMPROVED:**
Rewrite it with:
- Clearer task description (what exactly students do)
- Explicit deliverables list (what to submit)
- Grading criteria breakdown (how points are earned)
- Connection to the week's learning objectives
- Appropriate tool/submission instructions

Use ORIGINAL and IMPROVED as exact section labels so the diff view can parse them.`,
}

// ─────────────────────────────────────────
// Parser for /api/ask responses
// Extracts structured data AND diff content
// ─────────────────────────────────────────
export function parseAIResponse(text: string, prompt: string): ParsedAIData {
  const result: ParsedAIData = {}

  // ── Bloom's JSON ──
  const bloomMatch = text.match(/```json\s*(\[[\s\S]*?\])\s*```/)
  if (bloomMatch) {
    try { result.blooms = JSON.parse(bloomMatch[1]) as BloomLevel[] } catch {}
  }

  // ── Weeks ──
  const weeks: { week: number; topic: string }[] = []
  text.split('\n').forEach(line => {
    const m = line.match(/^\s*[-*]?\s*Week\s*(\d+)[:\-]\s*(.+)/i)
    if (m) {
      const topic = m[2].replace(/\*\*/g, '').trim()
      if (topic.length > 3 && !topic.match(/^(due|submit|turn in)/i)) {
        weeks.push({ week: parseInt(m[1]), topic })
      }
    }
  })
  if (weeks.length >= 3) result.weeks = weeks

  // ── Real-world items ──
  const rwMatches = [...text.matchAll(/\*\*([^*]{5,80})\*\*\s*\|\s*([^|\n]+)\|([^|\n]+)\|\s*(.+)/g)]
  if (rwMatches.length) {
    result.realworld = rwMatches.map(m => ({
      title: m[1].trim(), source: m[2].trim(),
      description: m[3].trim(), week: m[4].trim(),
    }))
  }

  // ── Python code ──
  const pyMatch = text.match(/```python\s*([\s\S]*?)```/)
  if (pyMatch) {
    result.python = [{ title: 'Python Activity', week: '—', description: '', code: pyMatch[1].trim() }]
  }

  // ── Critique (any critique-related prompt) ──
  const iscrtiique = QUICK_PROMPTS.critique && prompt === QUICK_PROMPTS.critique
  if (iscrtiique || prompt.toLowerCase().includes('critique') || prompt.toLowerCase().includes('critically')) {
    result.critique = text.slice(0, 2000)
  }

  // ── Diff — parse ORIGINAL/IMPROVED blocks from the improve prompt ──
  const origMatch = text.match(/\*\*ORIGINAL[:\*]*\*\*\s*\n([\s\S]*?)(?=\*\*IMPROVED[:\*]*\*\*)/i)
  const imprMatch = text.match(/\*\*IMPROVED[:\*]*\*\*\s*\n([\s\S]*?)(?=\*\*ORIGINAL[:\*]*\*\*|$)/i)
  if (origMatch || imprMatch) {
    result.diff = {
      orig: origMatch ? origMatch[1].trim() : 'See original assignment in your course.',
      impr: imprMatch ? imprMatch[1].trim() : 'See improved version above.',
    }
  }

  return result
}

// ─────────────────────────────────────────
// Generation system + user prompts
// ─────────────────────────────────────────
export function buildGenerationSystemPrompt(professorName: string, institution: string): string {
  return `You are CourseForge AI. Respond with a single valid JSON object and nothing else — no markdown fences, no preamble, no text before { or after }. Professor: ${professorName} at ${institution}. Never use placeholder text.`
}

export function buildGenerationPrompt(params: {
  title: string; number: string; description: string; level: string
  mode: string; startDate: string; endDate: string; holidays: string
  pattern: string; styleContext: string; professorName: string
  institution: string; options: { news: boolean; python: boolean; bloom: boolean; diff: boolean }
  toolPreferences?: ToolPreferences | null
  weekCount: number  // calculated from dates in the route, passed explicitly
}): string {
  return `Return a JSON object only — nothing before { or after }:

{
  "overview": {
    "description": "3-4 sentence course description",
    "outcomes": ["6 specific measurable learning outcomes"],
    "tools": ["required software and platforms"]
  },
  "weeks": [
    {
      "week_number": 1,
      "topic": "Specific topic name",
      "description": "2-3 sentences on what students will learn",
      "concept_overview": "3-4 sentence foundational explanation of the core concept this week — written for a student encountering it for the first time. Explain the key idea, why it matters, and how it connects to the course arc. This is distinct from the assignment description.",
      "readings": ["Author, Title, Chapter or URL — be specific, no placeholders"],
      "assignments_due": []
    }
  ],
  "assignments": [
    {
      "title": "Assignment title",
      "type": "Lab|Discussion|Reflection|Project|Quiz",
      "points": 50,
      "week": "Week 3",
      "due_date": "End of Week 3",
      "description": "4+ sentences: what to do, deliverables, submission format, grading criteria"
    }
  ],
  "python_activities": [
    {
      "title": "Activity title",
      "week": "Week 4",
      "description": "What students build and learn",
      "code": "# Colab-ready starter code with # YOUR CODE HERE gaps"
    }
  ],
  "realworld_items": [
    {
      "title": "Item title",
      "source": "Source name",
      "description": "2 sentences on relevance",
      "week": "Week 2"
    }
  ],
  "blooms": [
    {"level":"Remember","score":65,"color":"#ef4444"},
    {"level":"Understand","score":78,"color":"#f97316"},
    {"level":"Apply","score":90,"color":"#eab308"},
    {"level":"Analyze","score":82,"color":"#22c55e"},
    {"level":"Evaluate","score":58,"color":"#3b82f6"},
    {"level":"Create","score":75,"color":"#a855f7"}
  ]
}

Course: ${params.title}${params.number ? ` (${params.number})` : ''} | Level: ${params.level} | Mode: ${params.mode}
Pattern: ${params.pattern} | Dates: ${params.startDate || 'Fall'} to ${params.endDate || 'December'}
Holidays: ${params.holidays || 'None'} | Goals: ${params.description || 'Standard course'}
Professor: ${params.professorName} at ${params.institution}

Style: ${params.styleContext || 'Professional academic voice.'}${buildToolContext(params.toolPreferences)}

Rules:
- Generate EXACTLY ${params.weekCount} weeks — no more, no less
- Week numbers run from 1 to ${params.weekCount}
- Assignments: scale to the term length — ${params.weekCount <= 8 ? '4-6 assignments for a short/summer term' : '6-8 assignments for a full semester'}
- concept_overview for EVERY week — foundational, student-facing, 3-4 sentences
- Readings must be specific real titles/authors/URLs, appropriate for ${params.weekCount}-week pacing
- ${params.options.news ? 'realworld_items: one per week, specific 2024-2026 examples' : 'realworld_items: []'}
- ${params.options.python ? 'python_activities: ' + (params.weekCount <= 8 ? '1-2' : '2-3') + ' with actual runnable code' : 'python_activities: []'}
- ${params.options.bloom ? 'blooms: realistic scores based on the actual assignment mix' : 'blooms: []'}
- JSON only. Start with {. End with }.`
}

// ─────────────────────────────────────────
// Parse generation JSON response
// ─────────────────────────────────────────
export function parseGenerationResponse(raw: string): ParsedAIData & {
  overview?: { description: string; outcomes: string[]; tools: string[] }
  weeksWithReadings?: Array<{
    week_number: number; topic: string; description: string
    concept_overview: string; readings: string[]; assignments_due: string[]
  }>
} {
  const jsonStr = extractJSON(raw)
  try {
    const p = JSON.parse(jsonStr)
    return {
      overview: p.overview,
      weeks: (p.weeks || []).map((w: any) => ({ week: w.week_number, topic: w.topic || '' })),
      weeksWithReadings: (p.weeks || []).map((w: any) => ({
        week_number: w.week_number,
        topic: w.topic || '',
        description: w.description || '',
        concept_overview: w.concept_overview || '',
        readings: Array.isArray(w.readings)
          ? w.readings.map((r: any) => typeof r === 'string' ? r : [r.author, r.title, r.source, r.description].filter(Boolean).join(' — '))
          : [],
        assignments_due: Array.isArray(w.assignments_due) ? w.assignments_due : [],
      })),
      assignments: (p.assignments || []).map((a: any) => ({
        title: a.title || 'Untitled', type: a.type || 'Assignment',
        points: Number(a.points) || 0, week: a.week || '',
        due_date: a.due_date || '', description: a.description || '',
      })),
      python: (p.python_activities || []).map((x: any) => ({
        title: x.title || 'Python Activity', week: x.week || '',
        description: x.description || '', code: x.code || '',
      })),
      realworld: (p.realworld_items || []).map((r: any) => ({
        title: r.title || '', source: r.source || '',
        description: r.description || '', week: r.week || '',
      })),
      blooms: p.blooms || [],
    }
  } catch (e) {
    console.error('parseGenerationResponse failed. Raw snippet:', raw.slice(0, 500))
    return { weeks: [], assignments: [], python: [], realworld: [], blooms: [] }
  }
}

// ─────────────────────────────────────────
// Style profile analyzer
// ─────────────────────────────────────────
export async function analyzeStyleProfile(filesContext: string): Promise<StyleProfile> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: `Analyze professor course materials and return JSON only (no markdown, nothing outside braces):
{"chips":["trait1","trait2","trait3","trait4"],"description":"2-3 sentences","detectedTitle":"or empty","detectedNumber":"or empty","detectedTerm":"or empty"}`,
    messages: [{ role: 'user', content: `Analyze:\n\n${filesContext}` }],
  })
  const raw = (response.content.find(b => b.type === 'text') as any)?.text || '{}'
  try {
    return JSON.parse(extractJSON(raw)) as StyleProfile
  } catch {
    return {
      chips: ['Applied Learning', 'Real-World Data', 'Hands-On', 'Project-Based'],
      description: 'Practical, applied teaching approach focused on real-world outcomes.',
      detectedTitle: '', detectedNumber: '', detectedTerm: '',
    }
  }
}
