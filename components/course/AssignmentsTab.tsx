'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import type { Course, Assignment } from '@/types'

interface Props {
  course: Course
  totalPoints: number
  onNew: () => void
  onEdit: (a: Assignment) => void
  onDelete: (id: string) => void
  onUpdate: (updated: Assignment) => void
}

type EnhanceMode = 'update' | 'expand' | 'rubric' | 'modernize'

const ENHANCE_MODES: { id: EnhanceMode; label: string; desc: string; icon: string }[] = [
  { id: 'update',   icon: '📅', label: 'Update for Current Year', desc: `Replace dated examples, datasets, and case studies with ${new Date().getFullYear()} equivalents` },
  { id: 'expand',   icon: '📝', label: 'Expand & Clarify',        desc: 'Add step-by-step tasks, explicit deliverables list, and point breakdown' },
  { id: 'rubric',   icon: '📊', label: 'Add Grading Rubric',      desc: 'Restructure with clear criteria, point allocations, and "full credit" descriptions' },
  { id: 'modernize',icon: '🔧', label: 'Modernize Tools',         desc: 'Update software references, add current datasets, add real-world framing' },
]

interface EnhanceState {
  assignmentId: string
  loading: boolean
  mode: EnhanceMode | null
  result: { title: string; description: string; changes_summary: string } | null
  showPicker: boolean
}

const badgeClass = (type: string) => {
  switch ((type || '').toLowerCase()) {
    case 'lab': return 'cf-badge-lab'
    case 'discussion': return 'cf-badge-disc'
    case 'reflection': return 'cf-badge-refl'
    default: return 'cf-badge-proj'
  }
}

export default function AssignmentsTab({ course, totalPoints, onNew, onEdit, onDelete, onUpdate }: Props) {
  const [enhanceState, setEnhanceState] = useState<EnhanceState | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterWeek, setFilterWeek] = useState<string>('all')

  const assignments = course.assignments || []

  // Unique weeks for filter dropdown
  const weekOptions = [...new Set(assignments.map(a => a.week).filter(Boolean))].sort()

  const filtered = assignments.filter(a => {
    const matchSearch = !searchQuery ||
      a.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchWeek = filterWeek === 'all' || a.week === filterWeek
    return matchSearch && matchWeek
  })

  async function runEnhance(assignment: Assignment, mode: EnhanceMode) {
    setEnhanceState({ assignmentId: assignment.id, loading: true, mode, result: null, showPicker: false })
    try {
      const res = await fetch('/api/enhance-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId: assignment.id,
          title: assignment.title,
          type: assignment.type,
          points: assignment.points,
          week: assignment.week,
          description: assignment.description,
          courseTitle: course.title,
          courseNumber: course.number,
          styleProfile: course.style_profile,
          toolPreferences: course.tool_preferences,
          enhanceMode: mode,
        }),
      })
      const rawText = await res.text()
      let data: any
      try { data = JSON.parse(rawText) }
      catch { throw new Error(`Server error: ${rawText.replace(/<[^>]+>/g, '').slice(0, 120)}`) }
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
      setEnhanceState({ assignmentId: assignment.id, loading: false, mode, result: data.enhanced, showPicker: false })
    } catch (err: any) {
      toast.error(`Enhance failed: ${err.message}`)
      setEnhanceState(null)
    }
  }

  function acceptEnhancement(assignment: Assignment) {
    if (!enhanceState?.result) return
    onUpdate({ ...assignment, title: enhanceState.result.title, description: enhanceState.result.description })
    toast.success('Assignment updated')
    setEnhanceState(null)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <span style={{ fontSize: 12.5, color: 'var(--cf-muted)', flexShrink: 0 }}>
            {assignments.length} assignment{assignments.length !== 1 ? 's' : ''}
            {totalPoints > 0 && <span style={{ marginLeft: 8, color: 'var(--cf-gold)', fontFamily: 'var(--cf-mono)', fontSize: 11 }}>{totalPoints} pts</span>}
          </span>
          {assignments.length > 0 && (
            <input
              className="input is-small"
              placeholder="Search assignments…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ maxWidth: 220, fontSize: 12 }}
            />
          )}
          {weekOptions.length > 1 && (
            <select
              className="select is-small"
              value={filterWeek}
              onChange={e => setFilterWeek(e.target.value)}
              style={{ fontSize: 12, fontFamily: 'var(--cf-mono)' }}
            >
              <option value="all">All weeks</option>
              {weekOptions.map(w => <option key={w} value={w!}>{w}</option>)}
            </select>
          )}
        </div>
        <button className="button is-small is-ink" onClick={onNew}>+ New Assignment</button>
      </div>

      {assignments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--cf-muted)', fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📝</div>
          No assignments yet. Click <strong>+ New Assignment</strong>, use <strong>Deep Enrich</strong>, or import a Canvas .imscc file.
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: 'var(--cf-muted)', fontSize: 13 }}>
          No assignments match your search.
        </div>
      ) : (
        <div>
          {filtered.map(a => {
            const isEnhancing = enhanceState?.assignmentId === a.id
            const hasResult = isEnhancing && enhanceState?.result

            return (
              <div key={a.id} className="cf-card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Title + badges */}
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{a.title}</div>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginBottom: a.description ? 8 : 0 }}>
                      <span className={`cf-badge ${badgeClass(a.type || '')}`}>{a.type || 'Assignment'}</span>
                      {a.week && <span className="cf-mono" style={{ fontSize: 10, color: 'var(--cf-muted2)' }}>{a.week}</span>}
                      {a.due_date && <span className="cf-mono" style={{ fontSize: 10, color: 'var(--cf-muted2)' }}>Due: {a.due_date}</span>}
                      {a.points > 0 && (
                        <span style={{ background: 'var(--cf-gold-pale)', border: '1px solid rgba(184,134,11,0.3)', borderRadius: 4, padding: '1px 7px', color: 'var(--cf-gold)', fontFamily: 'var(--cf-mono)', fontSize: 10, fontWeight: 600 }}>
                          {a.points} pts
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {a.description && !hasResult && (
                      <div style={{ fontSize: 12.5, color: 'var(--cf-muted)', lineHeight: 1.65 }}>{a.description}</div>
                    )}

                    {/* Enhance result */}
                    {isEnhancing && enhanceState.loading && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', color: 'var(--cf-muted)', fontSize: 12.5 }}>
                        <span className="cf-spin" style={{ width: 14, height: 14, borderWidth: 2 }} />
                        Enhancing: {ENHANCE_MODES.find(m => m.id === enhanceState.mode)?.label}…
                      </div>
                    )}

                    {hasResult && (
                      <div style={{ marginTop: 8, border: '1px solid rgba(58,92,58,0.3)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ background: 'var(--cf-sage-pale)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cf-sage)' }}>
                            ✦ AI Enhanced — {ENHANCE_MODES.find(m => m.id === enhanceState.mode)?.label}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="button is-small is-sage"
                              onClick={() => acceptEnhancement(a)}
                            >
                              ✓ Accept
                            </button>
                            <button
                              className="button is-small is-ghost"
                              onClick={() => setEnhanceState(null)}
                            >
                              ✕ Discard
                            </button>
                          </div>
                        </div>
                        {enhanceState.result!.changes_summary && (
                          <div style={{ padding: '7px 12px', background: '#f8fffa', fontSize: 11.5, color: 'var(--cf-muted)', borderBottom: '1px solid rgba(58,92,58,0.15)', fontStyle: 'italic' }}>
                            {enhanceState.result!.changes_summary}
                          </div>
                        )}
                        <div style={{ padding: '10px 12px', background: '#fff', fontSize: 12.5, color: 'var(--cf-ink)', lineHeight: 1.7 }}>
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>{enhanceState.result!.title}</div>
                          <div style={{ color: 'var(--cf-muted)' }}>{enhanceState.result!.description}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'flex-start' }}>
                    {/* Enhance dropdown */}
                    <div style={{ position: 'relative' }}>
                      <button
                        className="button is-small is-ghost"
                        style={{ color: 'var(--cf-gold)', borderColor: 'rgba(184,134,11,0.3)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}
                        disabled={isEnhancing && enhanceState?.loading}
                        onClick={() => setEnhanceState(prev =>
                          prev?.assignmentId === a.id && prev.showPicker
                            ? null
                            : { assignmentId: a.id, loading: false, mode: null, result: null, showPicker: true }
                        )}
                        title="AI enhance this assignment"
                      >
                        ✦ Enhance
                      </button>

                      {isEnhancing && enhanceState?.showPicker && (
                        <>
                          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }}
                            onClick={() => setEnhanceState(null)} />
                          <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 99, minWidth: 260, overflow: 'hidden' }}>
                            <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '8px 14px 4px' }}>
                              AI Enhance: {a.title.slice(0, 28)}{a.title.length > 28 ? '…' : ''}
                            </div>
                            {ENHANCE_MODES.map(m => (
                              <button
                                key={m.id}
                                onClick={() => runEnhance(a, m.id)}
                                style={{ width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', borderBottom: '1px solid var(--cf-line)', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'flex-start', gap: 9 }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--cf-paper2)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                              >
                                <span style={{ fontSize: 16, flexShrink: 0 }}>{m.icon}</span>
                                <div>
                                  <div style={{ fontWeight: 600, color: 'var(--cf-ink)', marginBottom: 1 }}>{m.label}</div>
                                  <div style={{ fontSize: 11, color: 'var(--cf-muted)', lineHeight: 1.4 }}>{m.desc}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <button className="button is-small is-ghost" onClick={() => onEdit(a)} title="Edit assignment">✏</button>
                    <button className="button is-small is-ghost" style={{ color: 'var(--cf-rust)' }} onClick={() => onDelete(a.id)} title="Delete assignment">✕</button>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Points total */}
          {totalPoints > 0 && (
            <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--cf-gold-pale)', border: '1px solid rgba(184,134,11,0.25)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--cf-ink)' }}>Total course points ({assignments.length} assignments)</span>
              <span style={{ fontFamily: 'var(--cf-serif)', fontSize: 22, color: 'var(--cf-gold)', fontWeight: 500 }}>{totalPoints}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
