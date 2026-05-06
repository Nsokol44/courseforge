'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import type { ToolPreferences } from '@/types'

interface Props {
  weekNumber: number
  topic: string
  courseTitle: string
  courseNumber?: string
  conceptOverview?: string
  readings?: string[]
  activityDescription?: string
  toolPreferences?: ToolPreferences | null
}

type PromptType = 'notebook' | 'reading' | 'scenario'

export default function PromptGenerator({
  weekNumber, topic, courseTitle, courseNumber,
  conceptOverview, readings, activityDescription, toolPreferences,
}: Props) {
  const [open, setOpen] = useState(false)
  const [activeType, setActiveType] = useState<PromptType>('notebook')
  const [copied, setCopied] = useState(false)

  const pythonEnv = toolPreferences?.python_env || 'Google Colab'
  const gis = toolPreferences?.gis_software || 'QGIS'
  const submission = toolPreferences?.submission_format || 'Any'
  const noPython = pythonEnv === 'None'

  const readingList = readings?.length
    ? readings.map(r => `  - ${r}`).join('\n')
    : '  (none specified)'

  // ── NOTEBOOK PROMPT ─────────────────────────────────────────────────────
  const notebookPrompt = `You are an expert GIS educator. Generate a complete, runnable Jupyter notebook for the following course activity.

## COURSE CONTEXT
- Course: ${courseTitle}${courseNumber ? ` (${courseNumber})` : ''}
- Week ${weekNumber}: ${topic}
- Python Environment: ${pythonEnv}
- GIS Software: ${gis}
- Submission Format: ${submission}
${conceptOverview ? `- Concept Overview: ${conceptOverview}` : ''}
${activityDescription ? `- Activity Description: ${activityDescription}` : ''}

## EXISTING READINGS FOR THIS WEEK
${readingList}

## NOTEBOOK REQUIREMENTS

Return a complete .ipynb file as valid JSON. The notebook must have this exact cell structure:

**Cell 1 — Markdown (Title)**
# ${courseTitle}
## Week ${weekNumber}: ${topic}
[2-3 sentence learning objective]
---

**Cell 2 — Code (Setup)**
\`\`\`python
# Install packages
!pip install geopandas matplotlib shapely contextily folium -q
print("✅ Packages installed!")

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import geopandas as gpd
from shapely.geometry import Point, Polygon, box
import warnings
warnings.filterwarnings('ignore')
np.random.seed(2025)
print("📚 Libraries imported!")
\`\`\`

**Cell 3 — Markdown**: "## Section 2: Data Setup" + 2-3 sentences explaining the synthetic scenario

**Cell 4 — Code**: Create ALL synthetic spatial data needed for the analysis. Use numpy arrays, geopandas GeoDataFrames. NO external file reads, NO API calls. Everything must work offline in Colab.

**Cell 5 — Markdown**: "## Section 3: Exploratory Mapping" + explanation

**Cell 6 — Code**: Create 2-3 matplotlib subplots showing the data. Include titles, legends, colormaps relevant to ${topic}.

**Cell 7 — Markdown**: "## Section 4: Analysis" + explanation of the spatial operation

**Cell 8 — Code**: The core spatial analysis (buffers / joins / overlays / raster operations) using GeoPandas/Shapely. Print results with emojis.

**Cell 9 — Markdown**: "## Section 5: Results and Policy Map"

**Cell 10 — Code**: Final visualization showing analysis output. Include interpretation printed to console.

**Cell 11 — Markdown**: "## Section 6: Practice Questions"

Then 3 QUESTION PAIRS (each pair = 2 cells):
- A markdown cell with a question ending in: *Your answer here...*
- A code cell containing only: # YOUR CODE HERE

Questions must require students to:
1. Change a parameter (buffer distance, threshold, weight) and observe effect
2. Recalculate with different assumptions
3. Write a 2-3 paragraph policy brief based on their analysis

**Final Cell — Markdown**: Discussion post tie-in: "For your discussion post this week, apply these concepts to real data from [relevant local area]..."

## CODE STYLE REQUIREMENTS
- Section headers: # ============================================================
- Progress prints: use ✅ 📊 📍 🗺️ 🎯 emojis
- All data is SYNTHETIC — create realistic values using numpy
- Domain-specific context for "${topic}" throughout
- Comments in plain English explaining each step

Return ONLY the .ipynb JSON. No explanation before or after.`

  // ── READING PROMPT ───────────────────────────────────────────────────────
  const readingPrompt = `You are an expert GIS educator writing a Quicademy-style instructional reading module. Generate a complete, professional reading handout.

## COURSE CONTEXT
- Course: ${courseTitle}${courseNumber ? ` (${courseNumber})` : ''}
- Week ${weekNumber}: ${topic}
${conceptOverview ? `- Concept Overview: ${conceptOverview}` : ''}

## EXISTING READINGS
${readingList}

## OUTPUT FORMAT

Generate a complete HTML document styled like a Quicademy reading module. Use this exact structure:

\`\`\`html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${topic} — Week ${weekNumber}</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 780px; margin: 0 auto; padding: 40px 32px; font-size: 14px; line-height: 1.75; color: #1a1a1a; }
  .cover { text-align: center; padding: 40px 0 32px; border-bottom: 3px solid #1a6eb5; margin-bottom: 32px; }
  .badge { background: #1a6eb5; color: #fff; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 4px 14px; border-radius: 20px; display: inline-block; margin-bottom: 12px; }
  h1 { font-size: 30px; font-weight: 800; margin-bottom: 6px; }
  h2 { font-size: 19px; font-weight: 700; color: #1a6eb5; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 28px 0 12px; }
  p { margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13px; }
  th { background: #1a6eb5; color: #fff; padding: 9px 12px; text-align: left; }
  td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f8faff; }
  .key-terms { background: #f0f6ff; border: 1px solid #cce0ff; border-radius: 8px; padding: 20px; margin: 24px 0; }
  .key-terms h3 { font-size: 12px; font-weight: 700; color: #1a6eb5; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
  .term { margin-bottom: 8px; font-size: 13.5px; }
  .term strong { color: #1a1a1a; }
  .discussion { background: #fff8e6; border: 1px solid #ffd166; border-radius: 8px; padding: 20px; margin: 24px 0; }
  .discussion h3 { font-size: 12px; font-weight: 700; color: #b8860b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
  .discussion ol { padding-left: 18px; }
  .discussion li { margin-bottom: 8px; font-size: 13.5px; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #aaa; text-align: center; }
</style>
</head>
<body>
  <div class="cover">
    <div class="badge">Week ${weekNumber} Reading Module</div>
    <h1>[MODULE TITLE — e.g. "${topic}"]</h1>
    <div style="color:#666;font-size:16px">[Subtitle — e.g. "Understanding Spatial Concepts for Decision-Making"]</div>
    <div style="color:#999;font-size:13px;margin-top:4px;font-style:italic">${courseTitle}</div>
  </div>

  [INTRODUCTION SECTION — h2 "Introduction: [descriptive heading]"]
  [3-4 paragraphs introducing ${topic} — what it is, why it matters, how it fits the course]

  [PART 1 SECTION — h2 "Part 1: [Core Concept]"]
  [3-4 paragraphs + a relevant comparison TABLE]

  [PART 2 SECTION — h2 "Part 2: [Second Core Concept]"]
  [3-4 paragraphs]

  [PART 3 SECTION — h2 "Part 3: Case Studies"]
  [2-3 real-world case studies, 2-3 sentences each with clear takeaway]

  [PART 4 SECTION — h2 "Part 4: [Practical Application or Ethics]"]
  [3-4 paragraphs on application, pitfalls, or ethical considerations]

  [CONCLUSION — h2 "Wrapping It All Up"]
  [2-3 paragraphs synthesizing key ideas]

  <div class="key-terms">
    <h3>Key Terms</h3>
    [6-8 key terms as: <div class="term"><strong>Term</strong> — Definition (1-2 sentences)</div>]
  </div>

  <div class="discussion">
    <h3>Discussion Questions</h3>
    <ol>
      [3 thought-provoking questions for student reflection]
    </ol>
  </div>

  <div class="footer">${courseTitle} · Week ${weekNumber} · © ${new Date().getFullYear()}</div>
</body>
</html>
\`\`\`

## CONTENT REQUIREMENTS
- Write at a university undergraduate level — clear but academically rigorous
- Every section must have substantive content (3-4 paragraphs minimum per Part)
- The table should compare meaningful aspects of ${topic} (e.g. approaches, tools, applications, advantages/limitations)
- Case studies must be REAL and from 2020-2025
- Key terms must be central vocabulary students need for assignments
- Discussion questions should connect to the week's lab or assignment

Return ONLY the complete HTML document. No explanation before or after.`

  // ── SCENARIO PROMPT ──────────────────────────────────────────────────────
  const scenarioPrompt = `You are an expert GIS educator. Generate a complete scenario-based activity (no coding required) for this course week.

## COURSE CONTEXT
- Course: ${courseTitle}${courseNumber ? ` (${courseNumber})` : ''}
- Week ${weekNumber}: ${topic}
${conceptOverview ? `- Concept Overview: ${conceptOverview}` : ''}
${activityDescription ? `- Activity Description: ${activityDescription}` : ''}

## ACTIVITY STRUCTURE

Generate a structured scenario activity document as HTML with these exact sections:

**1. SCENARIO SETUP (200-250 words)**
Put the student in a specific professional role facing a real spatial problem. Be vivid — give them a job title, an organization, a specific place, a deadline, and a stakeholder asking for answers. The scenario must directly apply "${topic}".

**2. YOUR MISSION**
List 4-5 specific tasks the student must complete. Each task should be concrete and measurable (e.g., "Identify the three census tracts with the highest vulnerability score" not "analyze the data").

**3. MATERIALS PROVIDED**
List what data/maps/documents the student is given. These can be real public datasets (Census, USGS, city open data portals) or described synthetic datasets. Be specific about what fields are included.

**4. ANALYSIS APPROACH**
Step-by-step guidance on HOW to approach the analysis. Reference specific GIS concepts from "${topic}" (buffers, joins, overlays, etc.) without requiring specific software.

**5. DELIVERABLE**
Exactly what to submit: format, length, required elements, and how it will be graded (point breakdown).

**6. EXTENSION CHALLENGE**
One harder question for students who finish early — should require applying the concept in a new way or questioning an assumption.

**7. REFLECTION PROMPT**
One paragraph prompt connecting this scenario to broader themes in the course.

## STYLE
- Second person, active voice ("You are a GIS analyst...")
- Professional tone — this should feel like real fieldwork
- Tie to real places and real organizations where possible
- Reference specific public data sources by name (CDC, USGS, Census Bureau, etc.)

Return as a complete styled HTML document (same style template as above). No explanation before or after.`

  const prompts: Record<PromptType, { label: string; icon: string; prompt: string; disabled?: boolean }> = {
    notebook: {
      label: 'Python Notebook (.ipynb)',
      icon: '🐍',
      prompt: notebookPrompt,
      disabled: noPython,
    },
    reading: {
      label: 'Reading Handout (HTML/PDF)',
      icon: '📄',
      prompt: readingPrompt,
    },
    scenario: {
      label: 'Scenario Activity',
      icon: '🕵️',
      prompt: scenarioPrompt,
    },
  }

  function copyPrompt() {
    navigator.clipboard.writeText(prompts[activeType].prompt).then(() => {
      setCopied(true)
      toast.success('Prompt copied — paste into Claude, Gemini, or ChatGPT')
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <>
      <button
        className="button is-small is-ghost"
        onClick={() => setOpen(true)}
        title="Get AI prompt to generate files"
        style={{ color: 'var(--cf-muted)', borderColor: 'var(--cf-line)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        📋 Copy Prompt
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(11,12,15,0.65)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div style={{ background: 'var(--cf-paper)', border: '1px solid var(--cf-line)', borderRadius: 14, width: 720, maxWidth: '95vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 70px rgba(0,0,0,0.25)' }}>

            {/* Header */}
            <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--cf-line)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="cf-serif" style={{ fontSize: 20, fontWeight: 500 }}>
                  📋 Copy AI <em style={{ color: 'var(--cf-gold)' }}>Prompt</em>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--cf-muted)', marginTop: 3 }}>
                  Week {weekNumber}: <strong>{topic}</strong> — copy and paste into any AI to generate files
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 19, cursor: 'pointer', color: 'var(--cf-muted2)' }}>✕</button>
            </div>

            {/* Type selector */}
            <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--cf-line)', display: 'flex', gap: 8, flexShrink: 0 }}>
              {(Object.entries(prompts) as [PromptType, typeof prompts[PromptType]][]).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => !p.disabled && setActiveType(key)}
                  disabled={p.disabled}
                  style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${activeType === key ? 'var(--cf-gold)' : 'var(--cf-line2)'}`, background: activeType === key ? 'var(--cf-gold-pale)' : '#fff', color: p.disabled ? 'var(--cf-muted2)' : activeType === key ? 'var(--cf-gold)' : 'var(--cf-muted)', fontSize: 12.5, cursor: p.disabled ? 'not-allowed' : 'pointer', fontWeight: activeType === key ? 600 : 400, opacity: p.disabled ? 0.5 : 1 }}
                >
                  {p.icon} {p.label}
                </button>
              ))}
            </div>

            {/* Instructions */}
            <div style={{ padding: '12px 24px 0', flexShrink: 0 }}>
              <div style={{ padding: '10px 14px', background: 'var(--cf-gold-pale)', border: '1px solid rgba(184,134,11,0.25)', borderRadius: 7, fontSize: 12.5 }}>
                <strong>How to use:</strong> Click <strong>Copy Prompt</strong> below, then paste into{' '}
                <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cf-gold)' }}>Claude.ai ↗</a>,{' '}
                <a href="https://gemini.google.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cf-gold)' }}>Gemini ↗</a>, or{' '}
                <a href="https://chatgpt.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cf-gold)' }}>ChatGPT ↗</a>.
                {activeType === 'notebook' && ' The AI will return the full .ipynb JSON — save it as a .ipynb file and open in Google Colab.'}
                {activeType === 'reading' && ' The AI will return a complete HTML document — save as .html and open in a browser, then File → Print → Save as PDF.'}
                {activeType === 'scenario' && ' The AI will return a styled HTML activity document — save as .html and distribute to students or print as PDF.'}
              </div>
            </div>

            {/* Prompt preview */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
              <pre style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--cf-muted)', background: 'var(--cf-paper2)', padding: '14px 16px', borderRadius: 8, border: '1px solid var(--cf-line)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                {prompts[activeType].prompt}
              </pre>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 24px', borderTop: '1px solid var(--cf-line)', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button
                className="button is-gold is-medium"
                onClick={copyPrompt}
                style={{ flex: 1 }}
              >
                {copied ? '✓ Copied!' : `📋 Copy ${prompts[activeType].label} Prompt`}
              </button>
              <button className="button" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
