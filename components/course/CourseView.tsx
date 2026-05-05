'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase-browser'
import AIBanner from '@/components/ai/AIBanner'
import EnrichPanel from '@/components/course/EnrichPanel'
import CoursePreferences from '@/components/course/CoursePreferences'
import AssignmentEditor from '@/components/course/AssignmentEditor'
import WeekEditor from '@/components/course/WeekEditor'
import CourseUploadMaterials from '@/components/course/CourseUploadMaterials'
import WeekFileGenerator from '@/components/course/WeekFileGenerator'
import toast from 'react-hot-toast'
import type { Course, Profile, ParsedAIData, CourseContext, Week, Assignment, ToolPreferences } from '@/types'

type Tab = 'schedule' | 'assignments' | 'analysis' | 'python' | 'realworld'

function formatCritique(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<strong style="color:var(--cf-ink);display:block;margin:10px 0 4px">$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li style="margin-bottom:3px">$1</li>')
    .replace(/\n\n/g, '<br/>')
}

interface Props {
  course: Course
  profile: Pick<Profile, 'full_name' | 'institution' | 'department'> | null
}

export default function CourseView({ course: initialCourse, profile }: Props) {
  const [course, setCourse] = useState(initialCourse)
  const [activeTab, setActiveTab] = useState<Tab>('schedule')
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null | 'new'>(null)
  const [editingWeek, setEditingWeek] = useState<Week | null | 'new'>(null)
  const router = useRouter()
  const supabase = createBrowserClient()

  // Total points tally from all assignments
  const totalPoints = (course.assignments || []).reduce((sum, a) => sum + (a.points || 0), 0)

  const courseContext: CourseContext = {
    title: course.title,
    number: course.number || '',
    term: course.term || '',
    points: totalPoints,
    professorName: profile?.full_name || 'Professor',
    institution: profile?.institution || 'University',
    department: profile?.department || 'Faculty',
    styleProfile: course.style_profile,
    // Pass file names AND any extracted text so the AI has real content to reference
    fileNames: course.course_files?.map(f => f.filename) || [],
    weeks: (course.weeks || []).map(w => ({ week_number: w.week_number, topic: w.topic })),
    assignments: (course.assignments || []).map(a => ({ title: a.title, type: a.type, points: a.points })),
  }

  const handleAIResult = useCallback(async (_text: string, parsed: ParsedAIData) => {
    const updates: Partial<Course> = {}
    let needsRefresh = false

    if (parsed.blooms) {
      updates.blooms_data = parsed.blooms
      await supabase.from('courses').update({ blooms_data: parsed.blooms }).eq('id', course.id)
    }
    if (parsed.critique) {
      updates.critique = parsed.critique
      await supabase.from('courses').update({ critique: parsed.critique }).eq('id', course.id)
    }
    if (parsed.diff) {
      updates.diff_view = parsed.diff
      await supabase.from('courses').update({ diff_view: parsed.diff }).eq('id', course.id)
    }
    if (parsed.weeks?.length && !course.weeks?.length) {
      await supabase.from('weeks').delete().eq('course_id', course.id)
      await supabase.from('weeks').insert(
        parsed.weeks.map(w => ({ course_id: course.id, user_id: course.user_id, week_number: w.week, topic: w.topic, dates: '', assignments: [], tags: [], readings: [], reinforcement_materials: [] }))
      )
      needsRefresh = true
    }
    if (parsed.realworld?.length) {
      await supabase.from('realworld_items').insert(parsed.realworld.map(r => ({ course_id: course.id, user_id: course.user_id, ...r })))
      needsRefresh = true
    }
    if (parsed.python?.length) {
      await supabase.from('python_activities').insert(parsed.python.map(p => ({ course_id: course.id, user_id: course.user_id, ...p })))
      needsRefresh = true
    }
    if (parsed.assignments?.length && !course.assignments?.length) {
      await supabase.from('assignments').insert(parsed.assignments.map((a, i) => ({ course_id: course.id, user_id: course.user_id, sort_order: i, ...a })))
      needsRefresh = true
    }
    if (Object.keys(updates).length) setCourse(prev => ({ ...prev, ...updates }))
    if (needsRefresh) router.refresh()
  }, [course, supabase, router])

  // ── Assignment CRUD ──
  function handleSaveAssignment(saved: Assignment) {
    setCourse(prev => ({
      ...prev,
      assignments: editingAssignment && editingAssignment !== 'new'
        ? prev.assignments?.map(a => a.id === saved.id ? saved : a)
        : [...(prev.assignments || []), saved],
    }))
    // Update course total_points
    const newTotal = [...(course.assignments || []), ...(editingAssignment === 'new' ? [saved] : [])].reduce((s, a) => s + (a.id === saved.id ? saved.points : a.points), 0)
    supabase.from('courses').update({ total_points: newTotal }).eq('id', course.id)
  }

  async function deleteAssignment(id: string) {
    if (!confirm('Delete this assignment?')) return
    await supabase.from('assignments').delete().eq('id', id)
    const remaining = (course.assignments || []).filter(a => a.id !== id)
    const newTotal = remaining.reduce((s, a) => s + (a.points || 0), 0)
    await supabase.from('courses').update({ total_points: newTotal }).eq('id', course.id)
    setCourse(prev => ({ ...prev, assignments: remaining, total_points: newTotal }))
    toast.success('Assignment deleted')
  }

  // ── Week CRUD ──
  function handleSaveWeek(saved: Week) {
    setCourse(prev => ({
      ...prev,
      weeks: editingWeek && editingWeek !== 'new'
        ? prev.weeks?.map(w => w.id === saved.id ? saved : w)
        : [...(prev.weeks || []), saved].sort((a, b) => a.week_number - b.week_number),
    }))
  }

  async function deleteWeek(id: string) {
    if (!confirm('Delete this week?')) return
    await supabase.from('weeks').delete().eq('id', id)
    setCourse(prev => ({ ...prev, weeks: prev.weeks?.filter(w => w.id !== id) }))
    toast.success('Week deleted')
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'schedule', label: '📅 Schedule' },
    { id: 'assignments', label: `📝 Assignments (${course.assignments?.length || 0})` },
    { id: 'analysis', label: '📊 Analysis' },
    { id: 'python', label: `🎯 Activities (${course.python_activities?.length || 0})` },
    { id: 'realworld', label: '🌍 Real-World' },
  ]

  return (
    <>
      {/* Hero */}
      <div className="cf-hero">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="cf-mono" style={{ fontSize: 10, color: 'var(--cf-gold)', textTransform: 'uppercase', letterSpacing: '0.9px', marginBottom: 5 }}>
              {course.number || 'COURSE'}
            </div>
            <h1 className="cf-serif" style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.4px', marginBottom: 7 }}>
              {course.title}
            </h1>
            <div style={{ fontSize: 12.5, color: 'var(--cf-muted)', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>📅 {course.term || '—'}</span>
              <span>🗂 {course.course_files?.length || 0} source file(s)</span>
              {course.start_date && <span>⏱ {course.start_date} → {course.end_date || '?'}</span>}
              {totalPoints > 0 && (
                <span style={{ background: 'var(--cf-gold-pale)', border: '1px solid rgba(184,134,11,0.3)', borderRadius: 4, padding: '2px 8px', color: 'var(--cf-gold)', fontFamily: 'var(--cf-mono)', fontSize: 10 }}>
                  {totalPoints} pts total
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <CourseUploadMaterials
              course={course}
              onComplete={() => router.refresh()}
            />
            <CoursePreferences
              course={course}
              onSave={(prefs: ToolPreferences) => setCourse(prev => ({ ...prev, tool_preferences: prefs }))}
            />
            <EnrichPanel
              courseId={course.id}
              totalWeeks={course.weeks?.length || 0}
              toolPreferences={course.tool_preferences}
              onComplete={() => router.refresh()}
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="cf-stat-row">
        {[
          { val: course.weeks?.length || 0, lbl: 'Weeks' },
          { val: course.assignments?.length || 0, lbl: 'Assignments' },
          { val: totalPoints || course.total_points || '—', lbl: 'Total Points' },
          { val: course.python_activities?.length || 0, lbl: 'Python' },
        ].map(s => (
          <div key={s.lbl} className="cf-stat-box">
            <div className="cf-stat-val">{s.val}</div>
            <div className="cf-stat-lbl">{s.lbl}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '20px 32px 0' }}>
        <AIBanner courseContext={courseContext} onResult={handleAIResult} />
      </div>

      {/* Tabs */}
      <div style={{ position: 'sticky', top: 56, zIndex: 9, background: 'var(--cf-paper)' }}>
        <div className="tabs cf-tabs" style={{ padding: '0 32px', marginBottom: 0 }}>
          <ul>
            {tabs.map(t => (
              <li key={t.id} className={activeTab === t.id ? 'is-active' : ''}>
                <a onClick={() => setActiveTab(t.id)}>{t.label}</a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>

        {/* ── SCHEDULE ── */}
        {activeTab === 'schedule' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 12.5, color: 'var(--cf-muted)' }}>{course.weeks?.length || 0} weeks</span>
              <button className="button is-small is-ink" onClick={() => setEditingWeek('new')}>+ Add Week</button>
            </div>
            {!course.weeks?.length ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--cf-muted)', fontSize: 13 }}>
                <div style={{ marginBottom: 12, fontSize: 28 }}>📅</div>
                No schedule yet. Add weeks manually or use <strong>Deep Enrich</strong> to generate them.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {course.weeks.map(w => {
                  // Join related data into this week card
                  const weekLabel = `Week ${w.week_number}`
                  const weekAssignments = (course.assignments || []).filter((a: any) =>
                    a.week === weekLabel || a.week === String(w.week_number)
                  )
                  const weekRealworld = (course.realworld_items || []).filter((r: any) =>
                    r.week === weekLabel || r.week === String(w.week_number)
                  )
                  const weekActivities = (course.python_activities || []).filter((p: any) =>
                    p.week === weekLabel || p.week === String(w.week_number)
                  )

                  return (
                  <div key={w.id} className="cf-card" style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        {/* Week header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <span className="cf-mono" style={{ fontSize: 10, color: 'var(--cf-gold)', background: 'var(--cf-gold-pale)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(184,134,11,0.25)', flexShrink: 0 }}>
                            Week {w.week_number}
                          </span>
                          {w.dates && <span className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)' }}>{w.dates}</span>}
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{w.topic || '—'}</span>
                        </div>

                        {/* Concept Overview */}
                        {w.concept_overview && (
                          <div style={{ background: 'var(--cf-paper2)', border: '1px solid var(--cf-line)', borderLeft: '3px solid var(--cf-gold)', borderRadius: '0 7px 7px 0', padding: '10px 14px', marginBottom: 12 }}>
                            <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-gold)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Concept Overview</div>
                            <p style={{ fontSize: 13, color: 'var(--cf-ink)', lineHeight: 1.7, margin: 0 }}>{w.concept_overview}</p>
                          </div>
                        )}
                        {w.week_description && !w.concept_overview && (
                          <p style={{ fontSize: 12.5, color: 'var(--cf-muted)', lineHeight: 1.6, marginBottom: 8 }}>{w.week_description}</p>
                        )}

                        {/* Assignments for this week */}
                        {weekAssignments.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Assignments</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {weekAssignments.map((a: any) => (
                                <div key={a.id} style={{ padding: '9px 12px', background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 7 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: a.description ? 5 : 0 }}>
                                    <span className={`cf-badge cf-badge-${(a.type||'').toLowerCase() === 'lab' ? 'lab' : (a.type||'').toLowerCase() === 'discussion' ? 'disc' : (a.type||'').toLowerCase() === 'reflection' ? 'refl' : 'proj'}`}>{a.type || 'Assignment'}</span>
                                    <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{a.title}</span>
                                    {a.points > 0 && <span style={{ fontFamily: 'var(--cf-mono)', fontSize: 10, color: 'var(--cf-gold)', background: 'var(--cf-gold-pale)', padding: '1px 7px', borderRadius: 3, flexShrink: 0 }}>{a.points} pts</span>}
                                  </div>
                                  {a.description && <p style={{ fontSize: 12, color: 'var(--cf-muted)', lineHeight: 1.65, margin: 0 }}>{a.description}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Readings */}
                        {(w.readings?.length ?? 0) > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Readings</div>
                            <ul style={{ margin: 0, paddingLeft: 16 }}>
                              {w.readings.map((r: any, i: number) => {
                                const text = typeof r === 'string' ? r : [r.author, r.title, r.source, r.description].filter(Boolean).join(' — ')
                                const isUrl = text.startsWith('http')
                                return (
                                  <li key={i} style={{ fontSize: 12, color: 'var(--cf-muted)', lineHeight: 1.65 }}>
                                    {isUrl ? <a href={text} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cf-gold)', textDecoration: 'none' }}>{text} ↗</a> : text}
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )}

                        {/* Reinforcement Resources */}
                        {(w.reinforcement_materials?.length ?? 0) > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Resources</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {w.reinforcement_materials.map((m: any, i: number) => (
                                <a key={i} href={m.url} target="_blank" rel="noopener noreferrer"
                                  style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, textDecoration: 'none', padding: '5px 9px', background: 'var(--cf-gold-pale)', borderRadius: 6, border: '1px solid rgba(184,134,11,0.2)', width: 'fit-content' }}>
                                  <span>{m.type === 'video' ? '▶' : m.type === 'tool' ? '🔧' : m.type === 'dataset' ? '📊' : m.type === 'exercise' ? '✏️' : '📄'}</span>
                                  <span style={{ color: 'var(--cf-ink)', fontWeight: 500 }}>{m.title}</span>
                                  <span style={{ color: 'var(--cf-gold)' }}>↗</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Activities for this week */}
                        {weekActivities.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Activities</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {weekActivities.map((p: any) => {
                                const isScenario = !p.code || p.code.trim() === ''
                                return (
                                  <div key={p.id} style={{ padding: '9px 12px', background: isScenario ? 'var(--cf-gold-pale)' : '#f0f7f0', border: `1px solid ${isScenario ? 'rgba(184,134,11,0.25)' : 'rgba(58,92,58,0.2)'}`, borderRadius: 7 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: p.description ? 5 : 0 }}>
                                      {isScenario ? '🕵️' : '🐍'} {p.title}
                                    </div>
                                    {p.description && <p style={{ fontSize: 12, color: 'var(--cf-muted)', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{p.description}</p>}
                                    {p.code && <pre style={{ marginTop: 8, fontSize: 11, background: '#1a1a2e', color: '#a8d8a8', padding: '10px 12px', borderRadius: 5, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{p.code}</pre>}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Real-World Examples for this week */}
                        {weekRealworld.length > 0 && (
                          <div>
                            <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Real-World Examples</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              {weekRealworld.map((r: any) => (
                                <div key={r.id} style={{ padding: '8px 12px', background: '#fff', border: '1px solid var(--cf-line)', borderLeft: '3px solid var(--cf-gold)', borderRadius: '0 7px 7px 0' }}>
                                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                                    <span style={{ fontWeight: 600, fontSize: 12.5 }}>{r.title}</span>
                                    {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--cf-mono)', fontSize: 9, color: 'var(--cf-gold)', textDecoration: 'none', flexShrink: 0 }}>{r.source} ↗</a>}
                                    {!r.url && r.source && <span style={{ fontFamily: 'var(--cf-mono)', fontSize: 9, color: 'var(--cf-muted2)' }}>{r.source}</span>}
                                  </div>
                                  {r.description && <p style={{ fontSize: 12, color: 'var(--cf-muted)', lineHeight: 1.6, margin: 0 }}>{r.description}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Week actions */}
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <WeekFileGenerator
                          courseId={course.id}
                          weekId={w.id}
                          weekNumber={w.week_number}
                          topic={w.topic || ''}
                          courseTitle={course.title}
                          conceptOverview={w.concept_overview ?? undefined}
                          readings={w.readings}
                          activityDescription={weekActivities[0]?.description ?? undefined}
                          toolPreferences={course.tool_preferences}
                          hasPythonActivity={weekActivities.length > 0}
                        />
                        <EnrichPanel
                          courseId={course.id}
                          totalWeeks={1}
                          toolPreferences={course.tool_preferences}
                          onComplete={() => router.refresh()}
                          singleWeek={{ id: w.id, week_number: w.week_number, topic: w.topic || '' }}
                        />
                        <button className="button is-small is-ghost" onClick={() => setEditingWeek(w)}>✏ Edit</button>
                        <button className="button is-small is-ghost" style={{ color: 'var(--cf-rust)' }} onClick={() => deleteWeek(w.id)}>✕</button>
                      </div>
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ASSIGNMENTS ── */}
        {activeTab === 'assignments' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, color: 'var(--cf-muted)' }}>
                {course.assignments?.length || 0} assignments
                {totalPoints > 0 && <span style={{ marginLeft: 10, color: 'var(--cf-gold)', fontFamily: 'var(--cf-mono)', fontSize: 11 }}>{totalPoints} pts total</span>}
              </div>
              <button className="button is-small is-ink" onClick={() => setEditingAssignment('new')}>+ New Assignment</button>
            </div>

            {!course.assignments?.length ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--cf-muted)', fontSize: 13 }}>
                No assignments yet. Click <strong>+ New Assignment</strong> or use <strong>Deep Enrich</strong> to generate them.
              </div>
            ) : (
              <div>
                {course.assignments.map(a => (
                  <div key={a.id} className="cf-card">
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 5 }}>{a.title}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                          <span className={`cf-badge cf-badge-${a.type?.toLowerCase() === 'lab' ? 'lab' : a.type?.toLowerCase() === 'discussion' ? 'disc' : a.type?.toLowerCase() === 'reflection' ? 'refl' : 'proj'}`}>{a.type || 'Assignment'}</span>
                          {a.week && <span className="cf-mono" style={{ fontSize: 10, color: 'var(--cf-muted2)' }}>{a.week}</span>}
                          {a.due_date && <span className="cf-mono" style={{ fontSize: 10, color: 'var(--cf-muted2)' }}>Due: {a.due_date}</span>}
                          {a.points > 0 && (
                            <span style={{ background: 'var(--cf-gold-pale)', border: '1px solid rgba(184,134,11,0.3)', borderRadius: 4, padding: '1px 7px', color: 'var(--cf-gold)', fontFamily: 'var(--cf-mono)', fontSize: 10, fontWeight: 600 }}>
                              {a.points} pts
                            </span>
                          )}
                        </div>
                        {a.description && <div style={{ fontSize: 12.5, color: 'var(--cf-muted)', lineHeight: 1.65 }}>{a.description}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        <button className="button is-small is-ghost" onClick={() => setEditingAssignment(a)}>✏ Edit</button>
                        <button className="button is-small is-ghost" style={{ color: 'var(--cf-rust)' }} onClick={() => deleteAssignment(a.id)}>✕</button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Points summary */}
                {totalPoints > 0 && (
                  <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--cf-gold-pale)', border: '1px solid rgba(184,134,11,0.25)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--cf-ink)' }}>Total course points</span>
                    <span style={{ fontFamily: 'var(--cf-serif)', fontSize: 22, color: 'var(--cf-gold)', fontWeight: 500 }}>{totalPoints}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ANALYSIS ── */}
        {activeTab === 'analysis' && (
          <div>
            {/* Bloom's + Critique row */}
            <div className="columns" style={{ marginBottom: 0 }}>
              <div className="column">
                <div className="cf-card" style={{ height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>🧠 Bloom's Taxonomy</div>
                    <button className="button is-small is-ghost" onClick={() => {
                      document.getElementById('ai-bloom-btn')?.click()
                    }} style={{ fontSize: 11, color: 'var(--cf-gold)', border: '1px solid rgba(184,134,11,0.3)' }}>
                      ✦ Run Analysis
                    </button>
                  </div>
                  {course.blooms_data?.length ? (
                    <div>
                      {course.blooms_data.map(b => (
                        <div key={b.level} className="cf-bloom-row">
                          <div className="cf-bloom-lbl">{b.level}</div>
                          <div className="cf-bloom-track"><div className="cf-bloom-fill" style={{ width: `${b.score}%`, background: b.color }} /></div>
                          <div className="cf-bloom-val" style={{ color: b.color, fontWeight: 600 }}>{b.score}</div>
                        </div>
                      ))}
                      <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--cf-paper2)', borderRadius: 6, fontSize: 11, color: 'var(--cf-muted)' }}>
                        Overall coverage score: <strong style={{ color: 'var(--cf-ink)' }}>
                          {Math.round(course.blooms_data.reduce((s, b) => s + b.score, 0) / course.blooms_data.length)}
                        </strong>/100
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--cf-muted)', fontSize: 12.5 }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>🧠</div>
                      Click <strong>Run Analysis</strong> above — the AI will map every assignment to Bloom's levels and score coverage gaps.
                    </div>
                  )}
                </div>
              </div>
              <div className="column">
                <div className="cf-card" style={{ height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>📋 Course Critique</div>
                    <button className="button is-small is-ghost" onClick={() => {
                      document.getElementById('ai-critique-btn')?.click()
                    }} style={{ fontSize: 11, color: 'var(--cf-gold)', border: '1px solid rgba(184,134,11,0.3)' }}>
                      ✦ Run Critique
                    </button>
                  </div>
                  {course.critique ? (
                    <div style={{ fontSize: 12.5, color: 'var(--cf-muted)', lineHeight: 1.7, maxHeight: 340, overflowY: 'auto' }}
                      dangerouslySetInnerHTML={{ __html: formatCritique(course.critique) }}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--cf-muted)', fontSize: 12.5 }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
                      Click <strong>Run Critique</strong> — the AI will identify rubric gaps, scaffolding issues, and specific improvements for your assignments.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Diff view */}
            <div className="cf-card" style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>🔄 Assignment Diff — Original vs AI-Improved</div>
                <button className="button is-small is-ghost" onClick={() => {
                  document.getElementById('ai-improve-btn')?.click()
                }} style={{ fontSize: 11, color: 'var(--cf-gold)', border: '1px solid rgba(184,134,11,0.3)' }}>
                  ✦ Generate Diff
                </button>
              </div>
              {course.diff_view ? (
                <div className="cf-diff-grid">
                  <div className="cf-diff-col cf-diff-orig">
                    <div className="cf-diff-lbl">— Original</div>
                    <div style={{ fontSize: 12.5, color: 'var(--cf-muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{course.diff_view.orig}</div>
                  </div>
                  <div className="cf-diff-col cf-diff-impr">
                    <div className="cf-diff-lbl">+ AI Improved</div>
                    <div style={{ fontSize: 12.5, color: 'var(--cf-muted)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{course.diff_view.impr}</div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--cf-muted)', fontSize: 12.5 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🔄</div>
                  Click <strong>Generate Diff</strong> — the AI will rewrite your 2 weakest assignments and show exactly what changed.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PYTHON / ACTIVITIES ── */}
        {activeTab === 'python' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 12.5, color: 'var(--cf-muted)' }}>{course.python_activities?.length || 0} activities</span>
              {course.tool_preferences?.python_env && course.tool_preferences.python_env !== 'None' && (
                <span style={{ fontFamily: 'var(--cf-mono)', fontSize: 10, color: 'var(--cf-sage)', background: 'var(--cf-sage-pale)', padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(58,92,58,0.2)' }}>
                  Environment: {course.tool_preferences.python_env}
                </span>
              )}
            </div>
            {!course.python_activities?.length ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--cf-muted)', fontSize: 13 }}>
                No activities yet. Use <strong>Deep Enrich</strong> or ask the AI to generate activities.
              </div>
            ) : (
              course.python_activities.map(p => {
                const isScenario = !p.code || p.code.trim() === ''
                return (
                  <div key={p.id} className="cf-py-card">
                    <div className="cf-py-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--cf-paper)' }}>
                        {isScenario ? '🕵️' : '🐍'} {p.title}
                      </span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className="cf-badge cf-badge-refl cf-mono">{p.week || '—'}</span>
                        {!isScenario && course.tool_preferences?.python_env === 'Google Colab' && (
                          <span style={{ fontFamily: 'var(--cf-mono)', fontSize: 9, color: 'var(--cf-sage)', background: 'rgba(58,92,58,0.2)', padding: '2px 7px', borderRadius: 3 }}>Colab</span>
                        )}
                        {isScenario && (
                          <span style={{ fontFamily: 'var(--cf-mono)', fontSize: 9, color: 'var(--cf-gold)', background: 'rgba(184,134,11,0.2)', padding: '2px 7px', borderRadius: 3 }}>Scenario</span>
                        )}
                      </div>
                    </div>
                    {p.description && (
                      <div className="cf-py-desc" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{p.description}</div>
                    )}
                    {!isScenario && p.code && <pre className="cf-py-code">{p.code}</pre>}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ── REAL WORLD ── */}
        {activeTab === 'realworld' && (
          <div>
            <div style={{ marginBottom: 14, fontSize: 12.5, color: 'var(--cf-muted)' }}>
              {course.realworld_items?.length || 0} real-world injections
            </div>
            {!course.realworld_items?.length ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--cf-muted)', fontSize: 13 }}>
                No real-world examples yet. Use <strong>Deep Enrich</strong> or ask the AI to inject examples.
              </div>
            ) : (
              course.realworld_items.map(r => (
                <div key={r.id} className="cf-rw-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 3 }}>{r.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)' }}>{r.source}</span>
                        {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--cf-mono)', fontSize: 9, color: 'var(--cf-gold)', textDecoration: 'none', padding: '1px 6px', border: '1px solid rgba(184,134,11,0.3)', borderRadius: 3 }}>Open ↗</a>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--cf-muted)', lineHeight: 1.6 }}>{r.description}</div>
                    </div>
                    <span className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-gold)', flexShrink: 0 }}>→ {r.week}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── MODALS ── */}
      {(editingAssignment !== null) && (
        <AssignmentEditor
          assignment={editingAssignment === 'new' ? null : editingAssignment}
          courseId={course.id}
          userId={course.user_id}
          sortOrder={course.assignments?.length || 0}
          onSave={handleSaveAssignment}
          onClose={() => setEditingAssignment(null)}
        />
      )}

      {(editingWeek !== null) && (
        <WeekEditor
          week={editingWeek === 'new' ? null : editingWeek}
          courseId={course.id}
          userId={course.user_id}
          nextWeekNumber={(course.weeks?.length || 0) + 1}
          onSave={handleSaveWeek}
          onClose={() => setEditingWeek(null)}
        />
      )}
    </>
  )
}
