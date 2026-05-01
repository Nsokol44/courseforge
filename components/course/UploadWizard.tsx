'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase-browser'
import toast from 'react-hot-toast'
import type { StyleProfile } from '@/types'
import type { IMSCCParseResult } from '@/lib/imscc-parser'

type Step = 1 | 2 | 3

const EXT_ICON: Record<string, string> = {
  pdf: '📄', docx: '📝', pptx: '📊', imscc: '📦', txt: '📃', ipynb: '🐍',
}

interface UploadedFile {
  name: string
  type: string
  size: number
  text: string
  rawBuffer?: ArrayBuffer   // kept for .imscc parsing
}

export default function UploadWizard() {
  const [step, setStep] = useState<Step>(1)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [imsccResult, setImsccResult] = useState<IMSCCParseResult | null>(null)
  const [profile, setProfile] = useState<StyleProfile | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', number: '', term: '', start: '', end: '', points: '' })
  const router = useRouter()
  const supabase = createBrowserClient()

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const onDrop = useCallback((accepted: File[]) => {
    accepted.forEach(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''

      if (ext === 'imscc') {
        // Read as ArrayBuffer for proper ZIP parsing
        const r = new FileReader()
        r.onload = e => {
          const buf = e.target?.result as ArrayBuffer
          setFiles(prev => [...prev, {
            name: file.name, type: ext, size: file.size,
            text: `[${file.name} — IMSCC — ${(file.size / 1024).toFixed(0)}KB]`,
            rawBuffer: buf,
          }])
        }
        r.readAsArrayBuffer(file)
      } else if (['txt', 'ipynb'].includes(ext)) {
        const r = new FileReader()
        r.onload = e => {
          setFiles(prev => [...prev, { name: file.name, type: ext, size: file.size, text: (e.target?.result as string).slice(0, 3500) }])
        }
        r.readAsText(file)
      } else {
        // PDF, DOCX, PPTX — record metadata for AI context
        setFiles(prev => [...prev, {
          name: file.name, type: ext, size: file.size,
          text: `[${file.name} — ${ext.toUpperCase()} — ${(file.size / 1024).toFixed(0)}KB]`,
        }])
      }
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'application/zip': ['.imscc'],
      'application/json': ['.ipynb'],
    },
  })

  async function goToStep2() {
    if (!files.length) { toast.error('Upload at least one file'); return }
    setStep(2)
    setAnalyzing(true)

    // ── Parse any .imscc files ──
    const imsccFile = files.find(f => f.type === 'imscc' && f.rawBuffer)
    if (imsccFile?.rawBuffer) {
      try {
        const { parseIMSCC } = await import('@/lib/imscc-parser')
        const result = await parseIMSCC(imsccFile.rawBuffer)
        setImsccResult(result)
        // Pre-fill course name from imscc
        if (result.courseName && result.courseName !== 'Imported Course') {
          set('title', result.courseName)
        }
      } catch (e: any) {
        console.error('IMSCC parse error:', e)
        toast('Could not parse .imscc structure — course will be created without imported weeks')
      }
    }

    // ── AI style analysis ──
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: files.map(f => ({ name: f.name, type: f.type, text: f.text })) }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setProfile(data.profile)
      if (data.profile.detectedTitle && !form.title) set('title', data.profile.detectedTitle)
      if (data.profile.detectedNumber) set('number', data.profile.detectedNumber)
      if (data.profile.detectedTerm) set('term', data.profile.detectedTerm)
    } catch (err: any) {
      toast.error('AI analysis failed — you can still continue manually')
      setProfile({ chips: ['Uploaded', 'Ready'], description: 'Materials uploaded.', detectedTitle: '', detectedNumber: '', detectedTerm: '' })
    } finally {
      setAnalyzing(false)
    }
  }

  async function saveCourse() {
    if (!form.title.trim()) { toast.error('Course title is required'); return }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Calculate total points from imported assignments
      const importedPts = imsccResult?.assignments.reduce((s, a) => s + (a.points || 0), 0) || 0
      const totalPoints = parseInt(form.points) || importedPts || 0

      const { data: course, error } = await supabase.from('courses').insert({
        user_id: user.id,
        title: form.title,
        number: form.number || null,
        term: form.term || null,
        start_date: form.start || null,
        end_date: form.end || null,
        total_points: totalPoints,
        style_profile: profile,
      }).select().single()

      if (error) throw error

      // Save file metadata
      await supabase.from('course_files').insert(
        files.map(f => ({
          course_id: course.id, user_id: user.id,
          filename: f.name, file_type: f.type,
          extracted_text: f.text.slice(0, 4000),
        }))
      )

      // ── Save imported weeks from imscc ──
      if (imsccResult?.weeks.length) {
        await supabase.from('weeks').insert(
          imsccResult.weeks.map(w => ({
            course_id: course.id, user_id: user.id,
            week_number: w.week_number,
            topic: w.topic,
            dates: '',
            week_description: w.description || '',
            readings: w.readings || [],
            assignments: w.assignments_due || [],
            tags: [],
            reinforcement_materials: [],
          }))
        )
      }

      // ── Save imported assignments from imscc ──
      if (imsccResult?.assignments.length) {
        await supabase.from('assignments').insert(
          imsccResult.assignments.map((a, i) => ({
            course_id: course.id, user_id: user.id,
            title: a.title, type: a.type,
            points: a.points || 0,
            week: a.week, due_date: a.due_date || null,
            description: a.description, sort_order: i,
          }))
        )
      }

      const weekCount = imsccResult?.weeks.length || 0
      const asgCount = imsccResult?.assignments.length || 0
      toast.success(
        weekCount > 0
          ? `"${form.title}" added — ${weekCount} weeks and ${asgCount} assignments imported from Canvas`
          : `"${form.title}" added`
      )
      router.push(`/dashboard/courses/${course.id}`)
      router.refresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Step indicators */}
      <div className="tabs" style={{ borderBottom: '1px solid var(--cf-line)', marginBottom: 24 }}>
        <ul>
          {([['1. Upload', 1], ['2. Style Profile', 2], ['3. Course Details', 3]] as [string, number][]).map(([label, num]) => (
            <li key={num}>
              <a style={{ fontFamily: 'var(--cf-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', color: step === num ? 'var(--cf-gold)' : step > num ? 'var(--cf-sage)' : 'var(--cf-muted2)', borderBottomColor: step === num ? 'var(--cf-gold)' : 'transparent' }}>
                {step > num ? `✓ ${label}` : label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* STEP 1 — Upload */}
      {step === 1 && (
        <div>
          <div {...getRootProps()} className={`cf-dropzone ${isDragActive ? 'is-active' : ''}`}>
            <input {...getInputProps()} />
            <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
              {isDragActive ? 'Drop files here' : 'Drop your course materials here'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--cf-muted)' }}>
              .imscc (Canvas export), .pdf, .docx, .pptx, .txt, .ipynb
            </div>
          </div>

          {files.map(f => (
            <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 7, fontSize: 12, marginTop: 6 }}>
              <span style={{ fontSize: 17 }}>{EXT_ICON[f.type] || '📁'}</span>
              <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)' }}>{(f.size / 1024).toFixed(0)} KB</span>
              {f.type === 'imscc' && <span className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-gold)' }}>Canvas export</span>}
              <span className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-sage)' }}>✓</span>
              <button onClick={() => setFiles(p => p.filter(x => x.name !== f.name))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cf-muted2)', fontSize: 15 }}>×</button>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="button is-ink" onClick={goToStep2} disabled={!files.length}>Continue →</button>
          </div>
        </div>
      )}

      {/* STEP 2 — Profile */}
      {step === 2 && (
        <div>
          <p style={{ fontSize: 12.5, color: 'var(--cf-muted)', marginBottom: 14 }}>Based on your uploaded materials:</p>

          <div style={{ background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 9, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 9 }}>📊 Teaching Style Profile</div>
            {analyzing ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--cf-muted)', fontSize: 12 }}>
                <span className="cf-spin" /> Analyzing materials…
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {profile?.chips.map((c, i) => (
                  <span key={c} className={`tag ${['is-warning is-light','is-success is-light','is-info is-light','is-warning is-light','is-success is-light'][i % 5]}`}>{c}</span>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: 'var(--cf-paper2)', border: '1px solid var(--cf-line)', borderRadius: 7, padding: 12, fontSize: 12.5, color: 'var(--cf-muted)', lineHeight: 1.7, marginBottom: 12 }}>
            {analyzing ? 'Analyzing…' : profile?.description || 'No description available.'}
          </div>

          {/* Show imscc import preview */}
          {imsccResult && (imsccResult.weeks.length > 0 || imsccResult.assignments.length > 0) && (
            <div style={{ background: 'var(--cf-sage-pale)', border: '1px solid rgba(58,92,58,0.25)', borderRadius: 8, padding: '11px 14px', fontSize: 12.5, color: 'var(--cf-ink)', marginBottom: 14 }}>
              <strong style={{ color: 'var(--cf-sage)' }}>✓ Canvas content detected</strong>
              <div style={{ color: 'var(--cf-muted)', marginTop: 4 }}>
                Found <strong>{imsccResult.weeks.length} weeks</strong> and <strong>{imsccResult.assignments.length} assignments</strong> in the .imscc file.
                These will be imported automatically — you can edit everything after.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="button" onClick={() => setStep(1)}>← Back</button>
            <button className="button is-ink" onClick={() => setStep(3)} disabled={analyzing}>Looks good →</button>
          </div>
        </div>
      )}

      {/* STEP 3 — Details */}
      {step === 3 && (
        <div>
          <div className="field">
            <label className="label cf-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--cf-muted)' }}>Course Title *</label>
            <div className="control"><input className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Introduction to GIS" /></div>
          </div>
          <div className="columns">
            <div className="column">
              <div className="field">
                <label className="label cf-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--cf-muted)' }}>Course Number</label>
                <div className="control"><input className="input" value={form.number} onChange={e => set('number', e.target.value)} placeholder="e.g. GEOG 311" /></div>
              </div>
            </div>
            <div className="column">
              <div className="field">
                <label className="label cf-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--cf-muted)' }}>Term</label>
                <div className="control"><input className="input" value={form.term} onChange={e => set('term', e.target.value)} placeholder="e.g. Fall 2026" /></div>
              </div>
            </div>
          </div>
          <div className="columns">
            <div className="column">
              <div className="field">
                <label className="label cf-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--cf-muted)' }}>Start Date</label>
                <div className="control"><input className="input" type="date" value={form.start} onChange={e => set('start', e.target.value)} /></div>
              </div>
            </div>
            <div className="column">
              <div className="field">
                <label className="label cf-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--cf-muted)' }}>End Date</label>
                <div className="control"><input className="input" type="date" value={form.end} onChange={e => set('end', e.target.value)} /></div>
              </div>
            </div>
            <div className="column">
              <div className="field">
                <label className="label cf-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--cf-muted)' }}>Total Points</label>
                <div className="control">
                  <input className="input" type="number" value={form.points} onChange={e => set('points', e.target.value)}
                    placeholder={imsccResult?.assignments.reduce((s,a)=>s+(a.points||0),0) ? String(imsccResult.assignments.reduce((s,a)=>s+(a.points||0),0)) : '720'} />
                </div>
              </div>
            </div>
          </div>

          {imsccResult && imsccResult.weeks.length > 0 && (
            <div style={{ background: 'var(--cf-paper2)', border: '1px solid var(--cf-line)', borderRadius: 8, padding: '11px 14px', fontSize: 12, color: 'var(--cf-muted)', marginBottom: 14 }}>
              📦 Will import: {imsccResult.weeks.length} weeks · {imsccResult.assignments.length} assignments from Canvas
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <button className="button" onClick={() => setStep(2)}>← Back</button>
            <button className="button is-gold" onClick={saveCourse} disabled={saving}>
              {saving ? <span className="cf-spin" style={{ marginRight: 6 }} /> : null}
              ✓ Add Course
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
