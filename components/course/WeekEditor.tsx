'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import toast from 'react-hot-toast'
import type { Week } from '@/types'

interface Props {
  week: Week | null       // null = new week
  courseId: string
  userId: string
  nextWeekNumber?: number
  onSave: (week: Week) => void
  onClose: () => void
}

export default function WeekEditor({ week, courseId, userId, nextWeekNumber = 1, onSave, onClose }: Props) {
  const supabase = createBrowserClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    week_number: nextWeekNumber,
    topic: '',
    dates: '',
    week_description: '',
    concept_overview: '',
  })
  const [readings, setReadings] = useState<string[]>([])
  const [newReading, setNewReading] = useState('')
  const [assignments, setAssignments] = useState<string[]>([])
  const [newAssignment, setNewAssignment] = useState('')

  useEffect(() => {
    if (week) {
      setForm({
        week_number: week.week_number,
        topic: week.topic || '',
        dates: week.dates || '',
        week_description: week.week_description || '',
        concept_overview: week.concept_overview || '',
      })
      setReadings(week.readings || [])
      setAssignments(week.assignments || [])
    }
  }, [week])

  const setF = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  function addReading() {
    if (!newReading.trim()) return
    setReadings(p => [...p, newReading.trim()])
    setNewReading('')
  }

  function removeReading(i: number) {
    setReadings(p => p.filter((_, idx) => idx !== i))
  }

  function addAssignment() {
    if (!newAssignment.trim()) return
    setAssignments(p => [...p, newAssignment.trim()])
    setNewAssignment('')
  }

  function removeAssignment(i: number) {
    setAssignments(p => p.filter((_, idx) => idx !== i))
  }

  async function save() {
    if (!form.topic.trim()) { toast.error('Topic is required'); return }
    setSaving(true)
    try {
      const payload = {
        course_id: courseId,
        user_id: userId,
        week_number: form.week_number,
        topic: form.topic.trim(),
        dates: form.dates.trim(),
        week_description: form.week_description.trim(),
        concept_overview: form.concept_overview.trim(),
        readings,
        assignments,
        tags: [],
        reinforcement_materials: week?.reinforcement_materials || [],
      }

      if (week?.id) {
        const { data, error } = await supabase
          .from('weeks')
          .update(payload)
          .eq('id', week.id)
          .select()
          .single()
        if (error) throw error
        onSave(data as Week)
        toast.success('Week updated')
      } else {
        const { data, error } = await supabase
          .from('weeks')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        onSave(data as Week)
        toast.success('Week added')
      }
      onClose()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const labelStyle = {
    fontSize: 10, textTransform: 'uppercase' as const,
    letterSpacing: '0.5px', color: 'var(--cf-muted)',
    fontFamily: 'var(--cf-mono)', display: 'block', marginBottom: 5,
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(11,12,15,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--cf-paper)', border: '1px solid var(--cf-line)', borderRadius: 14, width: 600, maxWidth: '95vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--cf-line)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="cf-serif" style={{ fontSize: 19, fontWeight: 500 }}>
            {week ? `Edit Week ${week.week_number}` : 'New Week'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 19, cursor: 'pointer', color: 'var(--cf-muted2)' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {/* Week number + dates */}
          <div className="columns" style={{ marginBottom: 0 }}>
            <div className="column is-3">
              <div className="field">
                <label style={labelStyle}>Week #</label>
                <input className="input" type="number" min="1" value={form.week_number} onChange={e => setF('week_number', parseInt(e.target.value) || 1)} />
              </div>
            </div>
            <div className="column">
              <div className="field">
                <label style={labelStyle}>Dates</label>
                <input className="input" value={form.dates} onChange={e => setF('dates', e.target.value)} placeholder="e.g. Jan 13–17 or Week of Jan 13" />
              </div>
            </div>
          </div>

          {/* Topic */}
          <div className="field" style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Topic *</label>
            <input className="input" value={form.topic} onChange={e => setF('topic', e.target.value)} placeholder="e.g. Introduction to Spatial Data in Python" />
          </div>

          {/* Description */}
          <div className="field" style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Week Description</label>
            <textarea
              className="textarea"
              rows={4}
              value={form.week_description}
              onChange={e => setF('week_description', e.target.value)}
              placeholder="What will students learn and do this week? What key concepts are introduced?"
              style={{ fontSize: 13, lineHeight: 1.65 }}
            />
          </div>

          {/* Concept Overview */}
          <div className="field" style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Concept Overview — Student-Facing Foundation</label>
            <textarea
              className="textarea"
              rows={4}
              value={form.concept_overview}
              onChange={e => setF('concept_overview', e.target.value)}
              placeholder="Foundational explanation of the core concept this week — written for a student encountering it for the first time. What is the key idea? Why does it matter? How does it connect to what came before?"
              style={{ fontSize: 13, lineHeight: 1.65 }}
            />
            <div style={{ fontSize: 11, color: 'var(--cf-muted2)', marginTop: 4 }}>
              This appears at the top of each week card as the conceptual anchor before readings and assignments.
            </div>
          </div>

          {/* Readings */}
          <div className="field" style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Readings & Resources</label>
            {readings.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <div style={{ flex: 1, fontSize: 12.5, padding: '6px 10px', background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 6, color: 'var(--cf-ink)', wordBreak: 'break-all' }}>{r}</div>
                <button onClick={() => removeReading(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cf-muted2)', fontSize: 15, flexShrink: 0 }}>×</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 7, marginTop: 5 }}>
              <input
                className="input is-small"
                value={newReading}
                onChange={e => setNewReading(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addReading()}
                placeholder="Add reading, URL, or resource…"
                style={{ flex: 1 }}
              />
              <button className="button is-small is-ink" onClick={addReading}>+ Add</button>
            </div>
          </div>

          {/* Assignments due this week */}
          <div className="field">
            <label style={labelStyle}>Assignments Due This Week</label>
            <div style={{ fontSize: 11, color: 'var(--cf-muted2)', marginBottom: 7 }}>These labels show in the schedule view. Actual assignment details are managed in the Assignments tab.</div>
            {assignments.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <span className="cf-badge cf-badge-proj" style={{ flex: 1, padding: '4px 10px', borderRadius: 4, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 380 }}>{a}</span>
                <button onClick={() => removeAssignment(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cf-muted2)', fontSize: 15 }}>×</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 7, marginTop: 5 }}>
              <input
                className="input is-small"
                value={newAssignment}
                onChange={e => setNewAssignment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAssignment()}
                placeholder="e.g. Lab 2 – Raster Analysis"
                style={{ flex: 1 }}
              />
              <button className="button is-small is-ink" onClick={addAssignment}>+ Add</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--cf-line)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
          <button className="button" onClick={onClose}>Cancel</button>
          <button className="button is-gold" onClick={save} disabled={saving}>
            {saving ? <span className="cf-spin" style={{ marginRight: 6 }} /> : null}
            {week ? 'Save Changes' : 'Add Week'}
          </button>
        </div>
      </div>
    </div>
  )
}
