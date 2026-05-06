'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import type { ToolPreferences } from '@/types'

interface Props {
  courseId: string
  weekId: string
  weekNumber: number
  topic: string
  courseTitle: string
  conceptOverview?: string
  readings?: string[]
  activityDescription?: string
  toolPreferences?: ToolPreferences | null
  hasPythonActivity: boolean
}

export default function WeekFileGenerator({
  courseId, weekId, weekNumber, topic, courseTitle,
  conceptOverview, readings, activityDescription,
  toolPreferences, hasPythonActivity,
}: Props) {
  const [genNotebook, setGenNotebook] = useState(false)
  const [genReading, setGenReading] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  const pythonEnv = toolPreferences?.python_env || 'Google Colab'
  const noPython = pythonEnv === 'None'

  function downloadBlob(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function callAPI(endpoint: string, body: object): Promise<any> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const rawText = await res.text()
    let data: any
    try {
      data = JSON.parse(rawText)
    } catch {
      const preview = rawText.replace(/<[^>]+>/g, '').trim().slice(0, 150)
      throw new Error(`Server returned non-JSON: ${preview || `HTTP ${res.status}`}`)
    }
    if (!res.ok) throw new Error(data.error || `Server error ${res.status}`)
    return data
  }

  async function generateNotebook() {
    setGenNotebook(true)
    setShowMenu(false)
    try {
      const data = await callAPI('/api/generate-notebook', {
        courseId, weekId, weekNumber, topic, courseTitle,
        activityDescription: activityDescription || topic,
        toolPreferences,
      })
      if (!data.notebook) throw new Error('No notebook returned from server')
      const slug = topic.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      downloadBlob(
        JSON.stringify(data.notebook, null, 2),
        `Week${weekNumber}_${slug}.ipynb`,
        'application/json'
      )
      toast.success('Notebook downloaded — open in Google Colab or Jupyter')
    } catch (err: any) {
      console.error('Notebook generation error:', err)
      toast.error(`Notebook failed: ${err.message}`)
    } finally {
      setGenNotebook(false)
    }
  }

  async function generateReading() {
    setGenReading(true)
    setShowMenu(false)
    try {
      const data = await callAPI('/api/generate-reading', {
        weekNumber, topic, courseTitle, conceptOverview, readings,
      })
      if (!data.html) throw new Error('No HTML returned from server')
      const slug = topic.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      // Download as .html — open in browser and print to PDF (no popup blocker issue)
      downloadBlob(
        data.html,
        `Week${weekNumber}_${slug}_reading.html`,
        'text/html'
      )
      toast.success('Reading downloaded — open the .html file and use File → Print → Save as PDF')
    } catch (err: any) {
      console.error('Reading generation error:', err)
      toast.error(`Reading failed: ${err.message}`)
    } finally {
      setGenReading(false)
    }
  }

  const isLoading = genNotebook || genReading

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="button is-small is-ghost"
        onClick={() => setShowMenu(v => !v)}
        disabled={isLoading}
        title="Generate files for this week"
        style={{ color: 'var(--cf-gold)', borderColor: 'rgba(184,134,11,0.3)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        {isLoading
          ? <><span className="cf-spin" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> Generating…</>
          : <>⬇ Files</>
        }
      </button>

      {showMenu && !isLoading && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowMenu(false)} />
          <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 99, minWidth: 240, overflow: 'hidden' }}>
            <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '8px 14px 4px' }}>
              Week {weekNumber} — {topic.slice(0, 32)}{topic.length > 32 ? '…' : ''}
            </div>

            {!noPython && (
              <button
                onClick={generateNotebook}
                style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid var(--cf-line)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 9 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--cf-paper2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>🐍</span>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--cf-ink)', marginBottom: 1 }}>Python Notebook (.ipynb)</div>
                  <div style={{ fontSize: 11, color: 'var(--cf-muted)', lineHeight: 1.4 }}>
                    Colab-ready notebook with synthetic data, analysis, maps, and practice questions
                  </div>
                </div>
              </button>
            )}

            <button
              onClick={generateReading}
              style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 9 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--cf-paper2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>📄</span>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--cf-ink)', marginBottom: 1 }}>Reading Handout (.html)</div>
                <div style={{ fontSize: 11, color: 'var(--cf-muted)', lineHeight: 1.4 }}>
                  Quicademy-style module: intro → concepts → case studies → key terms. Open and print to PDF.
                </div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
