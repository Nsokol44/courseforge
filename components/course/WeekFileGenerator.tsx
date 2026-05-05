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
  conceptOverview?: string | null
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

  async function generateNotebook() {
    setGenNotebook(true)
    setShowMenu(false)
    try {
      const res = await fetch('/api/generate-notebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId, weekId, weekNumber, topic, courseTitle,
          activityDescription: activityDescription || topic,
          toolPreferences,
        }),
      })
      const rawText = await res.text()
      let data: any
      try { data = JSON.parse(rawText) } catch {
        throw new Error(`Server error: ${rawText.replace(/<[^>]+>/g, '').slice(0, 100)}`)
      }
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`)

      // Download as .ipynb
      const blob = new Blob([JSON.stringify(data.notebook, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const slug = `${topic.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_week${weekNumber}`
      a.download = `${slug}.ipynb`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`Notebook downloaded: ${a.download}`)
    } catch (err: any) {
      toast.error(`Notebook failed: ${err.message}`)
    } finally {
      setGenNotebook(false)
    }
  }

  async function generateReading() {
    setGenReading(true)
    setShowMenu(false)
    try {
      const res = await fetch('/api/generate-reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekNumber, topic, courseTitle, conceptOverview, readings,
        }),
      })
      const rawText = await res.text()
      let data: any
      try { data = JSON.parse(rawText) } catch {
        throw new Error(`Server error: ${rawText.replace(/<[^>]+>/g, '').slice(0, 100)}`)
      }
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`)

      // Open in new tab — professor can use browser Print → Save as PDF
      const blob = new Blob([data.html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const tab = window.open(url, '_blank')
      if (tab) {
        // Small delay then trigger print dialog
        setTimeout(() => {
          try { tab.print() } catch {}
        }, 800)
      }
      toast.success('Reading opened — use Print → Save as PDF to download')
    } catch (err: any) {
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
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 98 }}
            onClick={() => setShowMenu(false)}
          />
          {/* Dropdown */}
          <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 99, minWidth: 230, overflow: 'hidden' }}>
            <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '8px 14px 4px' }}>
              Week {weekNumber} — {topic.slice(0, 30)}
            </div>

            {!noPython && (
              <button
                onClick={generateNotebook}
                style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 9, borderBottom: '1px solid var(--cf-line)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--cf-paper2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>🐍</span>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--cf-ink)', marginBottom: 1 }}>Python Notebook (.ipynb)</div>
                  <div style={{ fontSize: 11, color: 'var(--cf-muted)' }}>
                    Full {pythonEnv} notebook with synthetic data, analysis, maps, and practice questions
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
                <div style={{ fontWeight: 600, color: 'var(--cf-ink)', marginBottom: 1 }}>Reading Handout (PDF)</div>
                <div style={{ fontSize: 11, color: 'var(--cf-muted)' }}>
                  Quicademy-style structured reading: intro → concepts → case studies → key terms
                </div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
