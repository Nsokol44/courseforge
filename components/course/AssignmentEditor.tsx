'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import toast from 'react-hot-toast'
import type { Assignment } from '@/types'

interface Props {
  assignment: Assignment | null     // null = create new
  courseId: string
  userId: string
  sortOrder?: number
  onSave: (assignment: Assignment) => void
  onClose: () => void
}

const TYPES = ['Lab', 'Discussion', 'Reflection', 'Project', 'Quiz', 'Exam', 'Assignment']

export default function AssignmentEditor({ assignment, courseId, userId, sortOrder = 0, onSave, onClose }: Props) {
  const supabase = createBrowserClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    type: 'Assignment',
    points: '0',
    week: '',
    due_date: '',
    description: '',
  })

  useEffect(() => {
    if (assignment) {
      setForm({
        title: assignment.title,
        type: assignment.type || 'Assignment',
        points: String(assignment.points || 0),
        week: assignment.week || '',
        due_date: assignment.due_date || '',
        description: assignment.description || '',
      })
    }
  }, [assignment])

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const payload = {
        course_id: courseId,
        user_id: userId,
        title: form.title.trim(),
        type: form.type,
        points: parseInt(form.points) || 0,
        week: form.week,
        due_date: form.due_date || null,
        description: form.description,
        sort_order: assignment?.sort_order ?? sortOrder,
      }

      if (assignment?.id) {
        // Update existing
        const { data, error } = await supabase
          .from('assignments')
          .update(payload)
          .eq('id', assignment.id)
          .select()
          .single()
        if (error) throw error
        onSave(data as Assignment)
        toast.success('Assignment updated')
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('assignments')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        onSave(data as Assignment)
        toast.success('Assignment created')
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

  const badgeClass = (t: string) =>
    t === 'Lab' ? 'cf-badge-lab' :
    t === 'Discussion' ? 'cf-badge-disc' :
    t === 'Reflection' ? 'cf-badge-refl' : 'cf-badge-proj'

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(11,12,15,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--cf-paper)', border: '1px solid var(--cf-line)', borderRadius: 14, width: 580, maxWidth: '95vw', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--cf-line)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="cf-serif" style={{ fontSize: 19, fontWeight: 500 }}>
            {assignment ? 'Edit Assignment' : 'New Assignment'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 19, cursor: 'pointer', color: 'var(--cf-muted2)' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {/* Title */}
          <div className="field" style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Title *</label>
            <input className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Lab 3 – Spatial Joins in Python" />
          </div>

          {/* Type selector */}
          <div className="field" style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => set('type', t)}
                  className={form.type === t ? `cf-badge ${badgeClass(t)}` : ''}
                  style={{ padding: '5px 13px', borderRadius: 20, border: `1px solid ${form.type === t ? 'currentColor' : 'var(--cf-line2)'}`, background: form.type === t ? undefined : '#fff', color: form.type === t ? undefined : 'var(--cf-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--cf-sans)', transition: 'all .15s' }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Points + Week + Due date row */}
          <div className="columns" style={{ marginBottom: 0 }}>
            <div className="column is-3">
              <div className="field">
                <label style={labelStyle}>Points</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={form.points}
                  onChange={e => set('points', e.target.value)}
                  placeholder="50"
                />
              </div>
            </div>
            <div className="column is-4">
              <div className="field">
                <label style={labelStyle}>Week</label>
                <input className="input" value={form.week} onChange={e => set('week', e.target.value)} placeholder="e.g. Week 4" />
              </div>
            </div>
            <div className="column">
              <div className="field">
                <label style={labelStyle}>Due Date</label>
                <input className="input" value={form.due_date} onChange={e => set('due_date', e.target.value)} placeholder="e.g. Sep 26 or 2026-09-26" />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="field">
            <label style={labelStyle}>Full Instructions / Description</label>
            <textarea
              className="textarea"
              rows={8}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Full assignment instructions — what students must do, how to submit, what will be graded…"
              style={{ fontSize: 13, lineHeight: 1.65 }}
            />
          </div>
        </div>

        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--cf-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--cf-muted)' }}>
            {parseInt(form.points) > 0 && <span><strong>{form.points}</strong> points</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button" onClick={onClose}>Cancel</button>
            <button className="button is-gold" onClick={save} disabled={saving}>
              {saving ? <span className="cf-spin" style={{ marginRight: 6 }} /> : null}
              {assignment ? 'Save Changes' : 'Create Assignment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
