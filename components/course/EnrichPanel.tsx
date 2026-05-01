'use client'

import { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import type { EnrichRequest, EnrichWeekResult, ReinforcementMaterial, ToolPreferences } from '@/types'

interface Props {
  courseId: string
  totalWeeks: number
  toolPreferences?: ToolPreferences | null
  onComplete: () => void
  // Optional: if provided, only enriches this one week (used from schedule tab)
  singleWeek?: { id: string; week_number: number; topic: string }
}

interface WeekStatus {
  weekNumber: number
  topic: string
  status: 'pending' | 'processing' | 'done' | 'error'
  result?: EnrichWeekResult
  errorMessage?: string
}

const TYPE_ICON: Record<string, string> = {
  video: '▶', article: '📄', tool: '🔧',
  dataset: '📊', exercise: '✏️', documentation: '📚',
}

export default function EnrichPanel({ courseId, totalWeeks, toolPreferences, onComplete, singleWeek }: Props) {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [weekStatuses, setWeekStatuses] = useState<WeekStatus[]>([])
  const [liveWeekCount, setLiveWeekCount] = useState(totalWeeks)
  const [generatingSchedule, setGeneratingSchedule] = useState(false)
  const [scheduleGenerated, setScheduleGenerated] = useState(false)
  const [options, setOptions] = useState<EnrichRequest['options']>({
    assignments: true, readings: true, reinforcement: true, realworld: true,
  })
  const cancelRef = useRef(false)

  const effectiveWeekCount = singleWeek ? 1 : (liveWeekCount || totalWeeks)
  const doneCount = weekStatuses.filter(w => w.status === 'done').length

  function toggleOption(k: keyof EnrichRequest['options']) {
    setOptions(p => ({ ...p, [k]: !p[k] }))
  }

  async function generateScheduleFirst() {
    setGeneratingSchedule(true)
    try {
      const res = await fetch('/api/generate-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Schedule generation failed')
      setLiveWeekCount(data.weekCount || 0)
      setScheduleGenerated(true)
      toast.success(`✓ ${data.weekCount} weeks generated`)
      onComplete()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setGeneratingSchedule(false)
    }
  }

  async function startEnrich() {
    cancelRef.current = false
    setRunning(true)
    setDone(false)
    setWeekStatuses([])

    try {
      // Load the weeks and course context — POST because GET auth is unreliable in Next.js 14
      const weeksRes = await fetch('/api/course-weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      })
      if (!weeksRes.ok) {
        const errData = await weeksRes.json().catch(() => ({}))
        throw new Error(errData.error || `Could not load course weeks (${weeksRes.status})`)
      }
      const { weeks, course } = await weeksRes.json()

      const weeksToProcess = singleWeek
        ? weeks.filter((w: any) => w.id === singleWeek.id)
        : weeks

      if (!weeksToProcess.length) {
        toast.error('No weeks to process')
        return
      }

      // Build shared context strings once
      const allTopics = weeks.map((w: any) => `Wk${w.week_number}: ${w.topic}`).join(' | ')
      const styleProfile = course.style_profile
        ? `${course.style_profile.chips?.join(', ')} — ${course.style_profile.description}`
        : 'Professional academic voice'

      // Initialize statuses
      setWeekStatuses(weeksToProcess.map((w: any) => ({
        weekNumber: w.week_number, topic: w.topic, status: 'pending' as const,
      })))

      // Process one week at a time — each is a separate HTTP call (no timeout risk)
      for (let i = 0; i < weeksToProcess.length; i++) {
        if (cancelRef.current) break
        const week = weeksToProcess[i]

        setWeekStatuses(prev => prev.map(ws =>
          ws.weekNumber === week.week_number ? { ...ws, status: 'processing' } : ws
        ))

        const existingAssignments = (course.assignments || [])
          .filter((a: any) => a.week === `Week ${week.week_number}`)
          .map((a: any) => a.title)

        try {
          const res = await fetch('/api/enrich-week', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              courseId,
              weekId: week.id,
              weekNumber: week.week_number,
              topic: week.topic,
              weekDescription: week.week_description,
              allTopics,
              styleProfile,
              courseTitle: course.title,
              courseDescription: course.description,
              existingAssignments,
              options,
              toolPreferences: toolPreferences || null,
            }),
          })

          // Read as text first — if server returned HTML (crash page), JSON.parse would throw
          // with a useless "NetworkError" message in Firefox
          const rawText = await res.text()
          let data: any
          try {
            data = JSON.parse(rawText)
          } catch {
            // Server returned non-JSON (Next.js error page or empty body)
            const preview = rawText.slice(0, 200).replace(/<[^>]+>/g, '').trim()
            throw new Error(`Server error: ${preview || `HTTP ${res.status}`}`)
          }

          if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`)

          setWeekStatuses(prev => prev.map(ws =>
            ws.weekNumber === week.week_number
              ? { ...ws, status: 'done', result: data.result }
              : ws
          ))
        } catch (weekErr: any) {
          setWeekStatuses(prev => prev.map(ws =>
            ws.weekNumber === week.week_number
              ? { ...ws, status: 'error', errorMessage: weekErr.message }
              : ws
          ))
        }

        // Small pause between calls to respect rate limits
        if (i < weeksToProcess.length - 1 && !cancelRef.current) {
          await new Promise(r => setTimeout(r, 300))
        }
      }

      if (!cancelRef.current) {
        setDone(true)
        toast.success(singleWeek ? '✓ Week enriched' : `✓ ${weeksToProcess.length} weeks enriched`)
        onComplete()
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRunning(false)
    }
  }

  function stopEnrich() {
    cancelRef.current = true
    setRunning(false)
    toast('Enrichment stopped')
  }

  const noWeeks = effectiveWeekCount === 0

  return (
    <>
      {/* Trigger button */}
      <button
        className={`button ${singleWeek ? 'is-small is-ghost' : 'is-ink'}`}
        onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 6,
          ...(singleWeek ? { color: 'var(--cf-gold)', borderColor: 'rgba(184,134,11,0.3)' } : {}) }}
        title={singleWeek ? `Enrich Week ${singleWeek.week_number}` : 'Deep enrich entire course'}
      >
        <span>✦</span>
        {singleWeek ? `Enrich Week ${singleWeek.week_number}` : 'Deep Enrich Course'}
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(11,12,15,0.65)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}
          onClick={e => { if (e.target === e.currentTarget && !running) setOpen(false) }}
        >
          <div style={{ background: 'var(--cf-paper)', border: '1px solid var(--cf-line)', borderRadius: 14, width: 680, maxWidth: '95vw', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 70px rgba(0,0,0,0.25)' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--cf-line)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="cf-serif" style={{ fontSize: 21, fontWeight: 500 }}>
                  {singleWeek
                    ? <>Enrich <em style={{ color: 'var(--cf-gold)' }}>Week {singleWeek.week_number}</em></>
                    : <>Deep <em style={{ color: 'var(--cf-gold)' }}>Enrich</em> Course</>
                  }
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--cf-muted)', marginTop: 3 }}>
                  {singleWeek
                    ? `AI will add assignments, readings, resources, and real-world examples for "${singleWeek.topic}"`
                    : 'AI processes every week and adds assignments, readings, resources, and real-world examples.'
                  }
                </div>
              </div>
              {!running && (
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 19, color: 'var(--cf-muted2)', cursor: 'pointer', lineHeight: 1 }}>✕</button>
              )}
            </div>

            {/* No weeks state */}
            {!running && !done && noWeeks && !singleWeek && (
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--cf-line)', flexShrink: 0 }}>
                <div style={{ background: 'var(--cf-rust-pale)', border: '1px solid rgba(139,58,42,0.25)', borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--cf-rust)', marginBottom: 5 }}>⚠ No weeks found in this course</div>
                  <div style={{ fontSize: 12.5, color: 'var(--cf-muted)', lineHeight: 1.65 }}>
                    Deep Enrich works week-by-week — the course needs a schedule first. Options:
                  </div>
                  <ul style={{ fontSize: 12.5, color: 'var(--cf-muted)', marginTop: 8, paddingLeft: 18, lineHeight: 1.8 }}>
                    <li>Click <strong>Generate Schedule</strong> below — AI builds from your course dates and description</li>
                    <li>Go to the <strong>Schedule tab</strong> and click <strong>+ Add Week</strong></li>
                    <li>Use the <strong>AI banner</strong> and ask it to build the schedule</li>
                  </ul>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="button is-ink" onClick={generateScheduleFirst} disabled={generatingSchedule}>
                    {generatingSchedule ? <><span className="cf-spin" style={{ marginRight: 6 }} />Generating…</> : '✦ Generate Schedule First'}
                  </button>
                  <button className="button" onClick={() => setOpen(false)}>Close</button>
                </div>
                {scheduleGenerated && (
                  <div style={{ marginTop: 10, padding: '9px 12px', background: 'var(--cf-sage-pale)', border: '1px solid rgba(58,92,58,0.25)', borderRadius: 6, fontSize: 12, color: 'var(--cf-sage)' }}>
                    ✓ Schedule generated. Reopen Deep Enrich to start enrichment.
                  </div>
                )}
              </div>
            )}

            {/* Options panel */}
            {!running && !done && !noWeeks && (
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--cf-line)', flexShrink: 0 }}>
                <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>What to generate</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  {([
                    { k: 'assignments', label: '📝 Assignments', desc: "Detailed instructions tied to the week's topic" },
                    { k: 'readings', label: '📖 Readings', desc: 'Specific chapters, docs, and articles' },
                    { k: 'reinforcement', label: '🔗 Reinforcement', desc: 'Videos, tools, datasets with real URLs' },
                    { k: 'realworld', label: '🌍 Real-World', desc: '2024–2026 examples with links' },
                  ] as { k: keyof EnrichRequest['options']; label: string; desc: string }[]).map(o => (
                    <label key={o.k} onClick={() => toggleOption(o.k)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: options[o.k] ? 'var(--cf-gold-pale)' : 'var(--cf-paper2)', border: `1px solid ${options[o.k] ? 'rgba(184,134,11,0.35)' : 'var(--cf-line)'}`, borderRadius: 8, cursor: 'pointer', transition: 'all .15s' }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${options[o.k] ? 'var(--cf-gold)' : 'var(--cf-line2)'}`, background: options[o.k] ? 'var(--cf-gold)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        {options[o.k] && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                      </div>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 2 }}>{o.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--cf-muted)' }}>{o.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                {!singleWeek && (
                  <div className="notification is-gold-light" style={{ fontSize: 12, padding: '9px 14px', marginBottom: 14 }}>
                    ⏱ <strong>{effectiveWeekCount} weeks</strong> — one AI call per week (~{Math.max(1, Math.ceil(effectiveWeekCount * 5 / 60))} min). Each week saves as it completes.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="button is-ink" onClick={startEnrich} disabled={!Object.values(options).some(Boolean)}>
                    ✦ {singleWeek ? 'Enrich This Week' : 'Start Enrichment'}
                  </button>
                  <button className="button" onClick={() => setOpen(false)}>Cancel</button>
                </div>
              </div>
            )}

            {/* Progress */}
            {(running || (done && weekStatuses.length > 0)) && (
              <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--cf-line)', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: done ? 'var(--cf-sage)' : 'var(--cf-ink)' }}>
                    {done ? `✓ Complete — ${doneCount} week${doneCount !== 1 ? 's' : ''} enriched` : 'Processing…'}
                  </span>
                  <span className="cf-mono" style={{ fontSize: 10, color: 'var(--cf-muted2)' }}>
                    {doneCount} / {weekStatuses.length}
                  </span>
                </div>
                {/* Progress dots */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {weekStatuses.map(ws => (
                    <div key={ws.weekNumber} title={`Wk ${ws.weekNumber}: ${ws.topic}`} style={{ width: 22, height: 22, borderRadius: 4, background: ws.status === 'done' ? 'var(--cf-sage)' : ws.status === 'error' ? 'var(--cf-rust)' : ws.status === 'processing' ? 'var(--cf-gold)' : 'var(--cf-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: ws.status === 'pending' ? 'var(--cf-muted)' : '#fff', fontFamily: 'var(--cf-mono)', transition: 'background 0.3s' }}>
                      {ws.status === 'processing' ? <span className="cf-spin" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> : ws.weekNumber}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {running && <button className="button is-small is-danger is-light" onClick={stopEnrich}>■ Stop</button>}
                  {done && <button className="button is-small is-sage" onClick={() => { setOpen(false); setDone(false); setWeekStatuses([]) }}>✓ Done — Close</button>}
                </div>
              </div>
            )}

            {/* Week results */}
            {weekStatuses.filter(ws => ws.status === 'done' || ws.status === 'error').length > 0 && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px 20px' }}>
                {weekStatuses.filter(ws => ws.result || ws.status === 'error').map(ws => (
                  <div key={ws.weekNumber} style={{ marginBottom: 10, borderRadius: 8, border: `1px solid ${ws.status === 'done' ? 'rgba(58,92,58,0.25)' : 'rgba(139,58,42,0.25)'}`, overflow: 'hidden' }}>
                    <div style={{ padding: '8px 12px', background: ws.status === 'done' ? 'var(--cf-sage-pale)' : 'var(--cf-rust-pale)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{ws.status === 'done' ? '✓' : '⚠'}</span>
                      <span className="cf-mono" style={{ fontSize: 10, color: 'var(--cf-muted)', minWidth: 44 }}>Week {ws.weekNumber}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 500 }}>{ws.topic}</span>
                      {ws.result && (
                        <span className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', marginLeft: 'auto' }}>
                          {[
                            ws.result.assignments?.length && `${ws.result.assignments.length} asg`,
                            ws.result.readings?.length && `${ws.result.readings.length} readings`,
                            ws.result.reinforcement_materials?.length && `${ws.result.reinforcement_materials.length} resources`,
                            ws.result.realworld?.length && `${ws.result.realworld.length} examples`,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    {ws.status === 'done' && ws.result && (
                      <div style={{ padding: '10px 12px', background: '#fff' }}>
                        {ws.result.assignments?.map((a, i) => (
                          <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < ws.result!.assignments!.length - 1 ? '1px solid var(--cf-line)' : 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span className={`cf-badge cf-badge-${a.type?.toLowerCase() === 'lab' ? 'lab' : a.type?.toLowerCase() === 'discussion' ? 'disc' : a.type?.toLowerCase() === 'reflection' ? 'refl' : 'proj'}`}>{a.type}</span>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{a.title}</span>
                              <span className="cf-mono" style={{ fontSize: 10, color: 'var(--cf-muted2)', marginLeft: 'auto' }}>{a.points} pts</span>
                            </div>
                            <p style={{ fontSize: 12, color: 'var(--cf-muted)', lineHeight: 1.6 }}>{a.description}</p>
                          </div>
                        ))}
                        {ws.result.readings?.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', marginBottom: 4 }}>Readings</div>
                            {ws.result.readings.map((r, i) => {
                              const text = typeof r === 'string' ? r : [r.author, r.title, r.source, r.description].filter(Boolean).join(' — ')
                              return <div key={i} style={{ fontSize: 12, color: 'var(--cf-muted)', marginBottom: 2 }}>→ {text}</div>
                            })}
                          </div>
                        )}
                        {ws.result.reinforcement_materials?.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', marginBottom: 4 }}>Resources</div>
                            {ws.result.reinforcement_materials.map((m, i) => (
                              <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 5, padding: '5px 8px', background: 'var(--cf-paper2)', borderRadius: 5 }}>
                                <span>{TYPE_ICON[m.type] || '🔗'}</span>
                                <div>
                                  <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--cf-gold)', textDecoration: 'none' }}>{m.title} ↗</a>
                                  <div style={{ fontSize: 11, color: 'var(--cf-muted)' }}>{m.description}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {ws.result.realworld?.length > 0 && (
                          <div>
                            <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', marginBottom: 4 }}>Real-World</div>
                            {ws.result.realworld.map((r, i) => (
                              <div key={i} style={{ padding: '5px 8px', background: 'var(--cf-paper2)', borderRadius: 5, borderLeft: '2px solid var(--cf-gold)', marginBottom: 4 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.title}</div>
                                {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--cf-gold)', fontFamily: 'var(--cf-mono)', textDecoration: 'none' }}>{r.source} ↗</a>}
                                <div style={{ fontSize: 11, color: 'var(--cf-muted)', marginTop: 2 }}>{r.description}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {ws.status === 'error' && (
                      <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--cf-rust)' }}>⚠ {ws.errorMessage}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
