import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase-server'
import { anthropic, MODEL } from '@/lib/ai'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { weekNumber, topic, courseTitle, conceptOverview, readings } = await req.json()
    if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 })

    const readingContext = readings?.length
      ? `Existing readings for this week: ${readings.join('; ')}`
      : ''

    const prompt = `Generate a complete Quicademy-style instructional reading module for this GIS course topic.

Course: ${courseTitle}
Week ${weekNumber}: ${topic}
Concept overview: ${conceptOverview || ''}
${readingContext}

Return a JSON object with this structure:
{
  "title": "Module title (e.g. 'GIS for Policy & Communication')",
  "subtitle": "Week ${weekNumber} Reading Module",
  "sections": [
    {
      "heading": "Introduction: [descriptive heading]",
      "content": "3-4 paragraph introduction to ${topic}. Explain what it is, why it matters, and how it fits into the course arc. Write for a student encountering this topic for the first time."
    },
    {
      "heading": "Part 1: [Core Concept Area]",
      "content": "3-4 paragraphs covering the first major concept. Include specific examples, real applications, and connection to GIS practice.",
      "table": {
        "headers": ["Column 1", "Column 2", "Column 3"],
        "rows": [["data", "data", "data"]]
      }
    },
    {
      "heading": "Part 2: [Second Core Concept Area]",
      "content": "3-4 paragraphs covering the second major concept area relevant to ${topic}."
    },
    {
      "heading": "Part 3: Case Studies in ${topic}",
      "content": "2-3 real-world case studies showing how ${topic} is applied in practice. Each case study should be 2-3 sentences with a clear takeaway."
    },
    {
      "heading": "Part 4: [Practical Application or Ethics]",
      "content": "3-4 paragraphs on practical application, common pitfalls, or ethical considerations relevant to ${topic}."
    },
    {
      "heading": "Wrapping It All Up",
      "content": "2-3 paragraph conclusion synthesizing the key ideas and connecting them to what comes next in the course."
    }
  ],
  "key_terms": [
    {"term": "Term 1", "definition": "Clear 1-2 sentence definition"},
    {"term": "Term 2", "definition": "Clear 1-2 sentence definition"}
  ],
  "discussion_questions": [
    "Thought-provoking question 1 for student reflection",
    "Thought-provoking question 2",
    "Thought-provoking question 3"
  ]
}

Rules:
- Write in a clear, academic but accessible voice — like a well-written textbook chapter
- Include 5-6 sections total with meaningful headings
- Include at least one table where it makes sense (comparisons, key applications by domain, etc.)
- Key terms should be 6-8 terms central to ${topic}
- Content must be substantive — each section 3-4 paragraphs minimum
- Make it specific to GIS and spatial thinking, not generic
- JSON only. Start with {. End with }.`

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,  // 6000 risks Vercel's 10s function timeout; 4000 is enough for a full module
      system: `You are an expert GIS educator writing instructional reading modules for university students. 
Write in a clear, engaging academic voice similar to Quicademy or ESRI training materials.
Return valid JSON only — no markdown fences, no text outside the JSON object.`,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (response.content.find(b => b.type === 'text') as any)?.text || ''
    if (!raw) {
      console.error('generate-reading: empty response from Claude')
      return NextResponse.json({ error: 'AI returned empty response. Please try again.' }, { status: 422 })
    }

    let readingData: any
    try {
      const cleaned = raw
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
      readingData = JSON.parse(cleaned)
    } catch {
      const firstBrace = raw.indexOf('{')
      if (firstBrace === -1) return NextResponse.json({ error: 'Could not generate reading. Please try again.' }, { status: 422 })
      try { readingData = JSON.parse(raw.slice(firstBrace)) }
      catch { return NextResponse.json({ error: 'Reading generation failed. Please try again.' }, { status: 422 }) }
    }

    // Convert to styled HTML for browser printing / PDF save
    const html = buildReadingHTML(readingData, courseTitle, weekNumber)

    return NextResponse.json({ html, readingData })
  } catch (err: any) {
    console.error('generate-reading error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function buildReadingHTML(data: any, courseTitle: string, weekNumber: number): string {
  const sections = (data.sections || []).map((s: any) => {
    const tableHtml = s.table
      ? `<table>
          <thead><tr>${s.table.headers.map((h: string) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${s.table.rows.map((row: string[]) => `<tr>${row.map((cell: string) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`
      : ''
    const content = (s.content || '')
      .split('\n\n')
      .map((p: string) => p.trim() ? `<p>${p}</p>` : '')
      .join('')
    return `<div class="section">
      <h2>${s.heading || ''}</h2>
      ${content}
      ${tableHtml}
    </div>`
  }).join('\n')

  const keyTerms = (data.key_terms || []).map((kt: any) =>
    `<div class="term"><span class="term-name">${kt.term}</span> — ${kt.definition}</div>`
  ).join('\n')

  const questions = (data.discussion_questions || []).map((q: string, i: number) =>
    `<li>${q}</li>`
  ).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${data.title || ''} — Week ${weekNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.75;
    color: #1a1a1a;
    background: #fff;
    max-width: 780px;
    margin: 0 auto;
    padding: 40px 32px 60px;
  }
  .cover {
    text-align: center;
    padding: 48px 0 36px;
    border-bottom: 3px solid #1a6eb5;
    margin-bottom: 36px;
  }
  .cover-badge {
    display: inline-block;
    background: #1a6eb5;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    padding: 4px 14px;
    border-radius: 20px;
    margin-bottom: 14px;
  }
  .cover h1 {
    font-size: 32px;
    font-weight: 800;
    color: #1a1a1a;
    margin-bottom: 8px;
    line-height: 1.2;
  }
  .cover .subtitle {
    font-size: 16px;
    color: #666;
    margin-bottom: 4px;
  }
  .cover .course-name {
    font-size: 13px;
    color: #999;
    font-style: italic;
  }
  .quicademy-brand {
    margin-top: 20px;
    font-size: 12px;
    color: #1a6eb5;
    font-weight: 600;
  }
  .section {
    margin-bottom: 32px;
  }
  h2 {
    font-size: 19px;
    font-weight: 700;
    color: #1a6eb5;
    margin-bottom: 12px;
    margin-top: 28px;
    padding-bottom: 6px;
    border-bottom: 1px solid #e5e7eb;
  }
  p {
    margin-bottom: 14px;
    color: #2d2d2d;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 18px 0;
    font-size: 13px;
  }
  th {
    background: #1a6eb5;
    color: #fff;
    padding: 9px 12px;
    text-align: left;
    font-weight: 600;
  }
  td {
    padding: 8px 12px;
    border-bottom: 1px solid #e5e7eb;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #f8faff; }
  .key-terms {
    background: #f0f6ff;
    border: 1px solid #cce0ff;
    border-radius: 8px;
    padding: 20px 22px;
    margin: 28px 0;
  }
  .key-terms h3 {
    font-size: 14px;
    font-weight: 700;
    color: #1a6eb5;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }
  .term {
    margin-bottom: 8px;
    font-size: 13.5px;
    line-height: 1.6;
  }
  .term-name {
    font-weight: 700;
    color: #1a1a1a;
  }
  .discussion {
    background: #fff8e6;
    border: 1px solid #ffd166;
    border-radius: 8px;
    padding: 20px 22px;
    margin: 28px 0;
  }
  .discussion h3 {
    font-size: 14px;
    font-weight: 700;
    color: #b8860b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }
  .discussion ol {
    padding-left: 18px;
  }
  .discussion li {
    margin-bottom: 8px;
    font-size: 13.5px;
    line-height: 1.65;
  }
  .footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
    font-size: 11px;
    color: #aaa;
    text-align: center;
  }
  @media print {
    body { padding: 20px; }
    .cover { page-break-after: avoid; }
    h2 { page-break-after: avoid; }
  }
</style>
</head>
<body>

<div class="cover">
  <div class="cover-badge">Week ${weekNumber} Reading Module</div>
  <h1>${data.title || 'Course Reading'}</h1>
  <div class="subtitle">${data.subtitle || ''}</div>
  <div class="course-name">${courseTitle}</div>
  <div class="quicademy-brand">Powered by CourseForge AI</div>
</div>

${sections}

${keyTerms ? `<div class="key-terms">
  <h3>Key Terms</h3>
  ${keyTerms}
</div>` : ''}

${questions ? `<div class="discussion">
  <h3>Discussion Questions</h3>
  <ol>${questions}</ol>
</div>` : ''}

<div class="footer">
  ${courseTitle} · Week ${weekNumber} · Generated by CourseForge AI · Copyright ${new Date().getFullYear()}
</div>

</body>
</html>`
}
