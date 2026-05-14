'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import toast from 'react-hot-toast'
import type { Week } from '@/types'

interface Props {
  courseId: string
  userId: string
  weeks: Week[]
  onComplete: () => void
}

export default function WeekMerger({ courseId, userId, weeks, onComplete }: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targetWeekNum, setTargetWeekNum] = useState(1)
  const [newTopic, setNewTopic] = useState('')
  const [merging, setMerging] = useState(false)
  const supabase = createBrowserClient()

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedWeeks = weeks.filter(w => selected.has(w.id))
  const suggestedTopic = selectedWeeks.length > 0 ? selectedWeeks[0].topic || '' : ''

  async function merge() {
    if (selected.size < 2) { toast.error('Select at least 2 weeks to merge'); return }
    setMerging(true)
    try {
      const toMerge = weeks.filter(w => selected.has(w.id))
      const keepWeek = toMerge[0]  // base week — keep its ID, update its content
      const dropWeeks = toMerge.slice(1)  // these get deleted after merging

      // Combine all content
      const combinedReadings = [...new Set(toMerge.flatMap(w => w.readings || []))]
      const combinedAssignments = [...new Set(toMerge.flatMap(w => w.assignments || []))]
      const combinedReinforcement = toMerge.flatMap(w => w.reinforcement_materials || [])
      const combinedDescription = toMerge
        .map(w => w.week_description || '')
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 800)
      const combinedConceptOverview = toMerge.find(w => w.concept_overview)?.concept_overview || null

      // Re-number all non-merged weeks so there are no gaps
      const remainingWeeks = weeks
        .filter(w => !selected.has(w.id) || w.id === keepWeek.id)
        .sort((a, b) => a.week_number - b.week_number)

      // Update the kept week with merged content
      const { error: updateErr } = await supabase
        .from('weeks')
        .update({
          week_number: targetWeekNum,
          topic: (newTopic.trim() || suggestedTopic || keepWeek.topic),
          week_description: combinedDescription,
          concept_overview: combinedConceptOverview,
          readings: combinedReadings,
          assignments: combinedAssignments,
          reinforcement_materials: combinedReinforcement,
        })
        .eq('id', keepWeek.id)
      if (updateErr) throw updateErr

      // Move assignments from dropped weeks to the kept week
      for (const dropped of dropWeeks) {
        await supabase
          .from('assignments')
          .update({ week: `Week ${targetWeekNum}` })
          .eq('course_id', courseId)
          .eq('week', `Week ${dropped.week_number}`)

        await supabase
          .from('realworld_items')
          .update({ week: `Week ${targetWeekNum}` })
          .eq('course_id', courseId)
          .eq('week', `Week ${dropped.week_number}`)
      }

      // Delete the dropped weeks
      for (const dropped of dropWeeks) {
        await supabase.from('weeks').delete().eq('id', dropped.id)
      }

      // Re-number all remaining weeks sequentially
      const stillRemaining = weeks
        .filter(w => !dropWeeks.find(d => d.id === w.id))
        .sort((a, b) => a.week_number - b.week_number)

      for (let i = 0; i < stillRemaining.length; i++) {
        const w = stillRemaining[i]
        const newNum = i + 1
        if (w.week_number !== newNum || w.id === keepWeek.id) {
          await supabase
            .from('weeks')
            .update({ week_number: newNum })
            .eq('id', w.id)
          // Update assignment week labels
          if (w.week_number !== newNum) {
            await supabase
              .from('assignments')
              .update({ week: `Week ${newNum}` })
              .eq('course_id', courseId)
              .eq('week', `Week ${w.week_number}`)
          }
        }
      }

      toast.success(`✓ Merged ${toMerge.length} weeks → Week ${targetWeekNum}. Weeks renumbered.`)
      setOpen(false)
      setSelected(new Set())
      onComplete()
    } catch (err: any) {
      toast.error(`Merge failed: ${err.message}`)
    } finally {
      setMerging(false)
    }
  }

  if (weeks.length < 2) return null

  return (
    <>
      <button
        className="button is-small is-ghost"
        onClick={() => {
          setSelected(new Set())
          setNewTopic('')
          setTargetWeekNum(1)
          setOpen(true)
        }}
        title="Merge multiple weeks into one"
        style={{ color: 'var(--cf-muted)', fontSize: 11 }}
      >
        ⊕ Merge Weeks
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(11,12,15,0.65)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}
          onClick={e => { if (e.target === e.currentTarget && !merging) setOpen(false) }}
        >
          <div style={{ background: 'var(--cf-paper)', border: '1px solid var(--cf-line)', borderRadius: 14, width: 640, maxWidth: '95vw', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 70px rgba(0,0,0,0.25)' }}>

            <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--cf-line)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="cf-serif" style={{ fontSize: 20, fontWeight: 500 }}>
                  ⊕ Merge <em style={{ color: 'var(--cf-gold)' }}>Weeks</em>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--cf-muted)', marginTop: 3 }}>
                  Select weeks to combine — readings, assignments, and resources will be merged. Weeks will be renumbered sequentially.
                </div>
              </div>
              {!merging && <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 19, cursor: 'pointer', color: 'var(--cf-muted2)' }}>✕</button>}
            </div>

            {/* Week list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
              <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                Select weeks to merge ({selected.size} selected)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {weeks.map(w => (
                  <div
                    key={w.id}
                    onClick={() => toggle(w.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: `1px solid ${selected.has(w.id) ? 'var(--cf-gold)' : 'var(--cf-line)'}`, borderRadius: 7, cursor: 'pointer', background: selected.has(w.id) ? 'var(--cf-gold-pale)' : '#fff', transition: 'all .12s', userSelect: 'none' }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${selected.has(w.id) ? 'var(--cf-gold)' : 'var(--cf-line2)'}`, background: selected.has(w.id) ? 'var(--cf-gold)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {selected.has(w.id) && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                    </div>
                    <span className="cf-mono" style={{ fontSize: 10, color: 'var(--cf-gold)', background: 'var(--cf-gold-pale)', padding: '1px 6px', borderRadius: 3, flexShrink: 0 }}>
                      Wk {w.week_number}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.topic || '—'}</span>
                    {(w.assignments?.length ?? 0) > 0 && (
                      <span className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', flexShrink: 0 }}>{w.assignments!.length} asg</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Merge options */}
            {selected.size >= 2 && (
              <div style={{ padding: '12px 24px', borderTop: '1px solid var(--cf-line)', borderBottom: '1px solid var(--cf-line)', flexShrink: 0, background: 'var(--cf-paper2)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Merged Week Topic</div>
                    <input
                      className="input is-small"
                      value={newTopic}
                      onChange={e => setNewTopic(e.target.value)}
                      placeholder={suggestedTopic || 'Enter the topic for the merged week…'}
                    />
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Week #</div>
                    <input
                      className="input is-small"
                      type="number"
                      min={1}
                      style={{ width: 70 }}
                      value={targetWeekNum}
                      onChange={e => setTargetWeekNum(parseInt(e.target.value) || 1)}
                    />
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--cf-muted)', marginTop: 7 }}>
                  Merging {selected.size} weeks → Week {targetWeekNum}. All other weeks will be renumbered.
                  {selectedWeeks.reduce((s, w) => s + (w.assignments?.length || 0), 0) > 0 &&
                    ` ${selectedWeeks.reduce((s, w) => s + (w.assignments?.length || 0), 0)} assignment labels will be merged.`
                  }
                </div>
              </div>
            )}

            <div style={{ padding: '12px 24px', display: 'flex', gap: 8, justifyContent: 'space-between', flexShrink: 0 }}>
              <button className="button" onClick={() => setOpen(false)} disabled={merging}>Cancel</button>
              <button
                className="button is-gold"
                onClick={merge}
                disabled={selected.size < 2 || merging}
              >
                {merging
                  ? <><span className="cf-spin" style={{ marginRight: 6 }} />Merging…</>
                  : `⊕ Merge ${selected.size} Weeks`
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
