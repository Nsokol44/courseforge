'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { Course, Profile, ToolPreferences } from '@/types'

interface Props {
  courses: Pick<Course, 'id' | 'title' | 'style_profile'>[]
  profile: Pick<Profile, 'full_name' | 'institution' | 'department'> | null
}

  const STEPS = [
    ['Analyzing your uploaded courses', 'Inferring teaching style from materials', 18],
    ['Building teaching profile', 'Detecting voice, assignment patterns, philosophy', 34],
    ['Mapping semester timeline', 'Distributing weeks across the semester', 50],
    ['Generating course modules', 'Creating week-by-week topics and concept overviews', 64],
    ['Designing assignments', 'Building assignments in your style', 76],
    ['Injecting real-world examples', 'Sourcing current datasets and news', 88],
    activityMode === 'python'
      ? ['Generating Python activities', 'Creating interactive Colab notebooks', 95]
      : activityMode === 'scenario'
      ? ['Generating scenario activities', 'Writing role-play detective exercises', 95]
      : ['Generating structured readings', 'Writing Quicademy-style module content', 95],
    ['Finalizing', "Running Bloom's check and packaging", 100],
  ] as const

const PYTHON_ENVS = ['Google Colab', 'Jupyter Notebook', 'JupyterLab', 'VS Code', 'Local Python', 'None']
const SUBMISSION_FORMATS = ['Google Colab Link', 'Jupyter Notebook (.ipynb)', 'PDF', 'Word Document', 'Canvas Quiz', 'GitHub Repository', 'Any']
const GIS_OPTIONS = ['QGIS', 'ArcGIS Pro', 'ArcGIS Online', 'GeoPandas only', 'None']

function formatMD(text: string) {
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<code style="display:block;background:var(--cf-paper3);padding:8px;border-radius:5px;font-size:10px;white-space:pre;overflow-x:auto;">$1</code>')
    .replace(/^[- *] (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
}

export default function GenerateCourse({ courses, profile }: Props) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stepTitle, setStepTitle] = useState('')
  const [stepSub, setStepSub] = useState('')
  const [result, setResult] = useState<{ text: string; courseId?: string } | null>(null)
  const [form, setForm] = useState({
    title: '', number: '', description: '', level: 'Undergraduate Upper Division',
    mode: 'Online Asynchronous', startDate: '', endDate: '', holidays: '',
    pattern: 'Dossier / Portfolio', styleSource: 'all',
  })
  const [options, setOptions] = useState({ news: true, bloom: true, diff: false })
  const [activityMode, setActivityMode] = useState<'python' | 'scenario' | 'none'>('python')
  const [toolPrefs, setToolPrefs] = useState<ToolPreferences>({
    python_env: 'Google Colab',
    gis_software: 'QGIS',
    submission_format: 'Google Colab Link',
    lms: 'Canvas',
    custom_tools: [],
    constraints: '',
  })
  const [customToolInput, setCustomToolInput] = useState('')

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))
  const setTool = (k: keyof ToolPreferences, v: any) => setToolPrefs(p => ({ ...p, [k]: v }))

  const styleContext = courses.length
    ? courses.map(c => `Course: "${c.title}" — Style: ${c.style_profile?.chips?.join(', ') || 'applied'} — ${c.style_profile?.description || ''}`).join('\n')
    : ''

  // Calculate week count from dates for display
  function calcWeekCount(start: string, end: string): number {
    if (!start || !end) return 15
    const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24))
    return Math.min(18, Math.max(4, Math.round(days / 7)))
  }
  const previewWeekCount = calcWeekCount(form.startDate, form.endDate)

  async function generate() {
    if (!form.title.trim()) { toast.error('Please enter a course title'); return }
    setGenerating(true)
    setResult(null)

    for (const [title, sub, pct] of STEPS) {
      setStepTitle(title as string)
      setStepSub(sub as string)
      setProgress(pct as number)
      await new Promise(r => setTimeout(r, 780))
    }

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          options: { ...options, python: activityMode === 'python' },
          activityMode,
          toolPreferences: toolPrefs,
          styleContext,
          professorName: profile?.full_name || 'Professor',
          institution: profile?.institution || 'University',
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult({ text: data.text, courseId: data.courseId })
      setStepTitle('✓ Course Generated')
      setStepSub(`${data.counts?.weeks || 0} weeks · ${data.counts?.assignments || 0} assignments · ${data.counts?.realworld || 0} real-world examples`)
      toast.success('Course generated! Opening now…')
      // Navigate directly — don't rely on router.refresh() which doesn't revalidate layouts
      setTimeout(() => router.push(`/dashboard/courses/${data.courseId}`), 1200)
    } catch (err: any) {
      toast.error(err.message)
      setStepTitle('Generation failed')
      setStepSub(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const labelStyle = { fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: 'var(--cf-muted)', fontFamily: 'var(--cf-mono)' }
  const chipBtn = (active: boolean) => ({
    padding: '5px 13px', borderRadius: 20, border: `1px solid ${active ? 'var(--cf-gold)' : 'var(--cf-line2)'}`,
    background: active ? 'var(--cf-gold-pale)' : '#fff', color: active ? 'var(--cf-gold)' : 'var(--cf-muted)',
    fontSize: 12.5, cursor: 'pointer' as const, fontFamily: 'var(--cf-sans)', transition: 'all .15s',
    fontWeight: active ? 600 : 400,
  })

  return (
    <div style={{ maxWidth: 720 }}>
      <p className="cf-serif" style={{ fontSize: 24, fontWeight: 300, fontStyle: 'italic', marginBottom: 5 }}>Generate a New Course</p>
      <p style={{ fontSize: 13, color: 'var(--cf-muted)', marginBottom: 24 }}>
        CourseForge uses your uploaded materials to generate content that sounds like <em>you</em>, respecting the tools you specify.
      </p>

      {courses.length > 0 && (
        <div className="notification is-gold-light mb-4" style={{ fontSize: 12, padding: '10px 14px' }}>
          <strong>✓ Style source:</strong> Will mirror voice from: {courses.map(c => <em key={c.id}> {c.title}</em>)}.
        </div>
      )}

      {/* ── Course Identity ── */}
      <div style={{ background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 10, padding: 22, marginBottom: 14 }}>
        <p className="cf-mono" style={{ ...labelStyle, marginBottom: 9 }}>Course Identity</p>
        <div className="columns">
          <div className="column">
            <div className="field">
              <label className="label" style={labelStyle}>Course Title</label>
              <div className="control"><input className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Advanced Spatial Analysis" /></div>
            </div>
          </div>
          <div className="column is-4">
            <div className="field">
              <label className="label" style={labelStyle}>Course Number</label>
              <div className="control"><input className="input" value={form.number} onChange={e => set('number', e.target.value)} placeholder="e.g. GEOG 511" /></div>
            </div>
          </div>
        </div>
        <div className="field">
          <label className="label" style={labelStyle}>Goals / Description</label>
          <div className="control"><textarea className="textarea" value={form.description} onChange={e => set('description', e.target.value)} placeholder="What should students be able to do by the end?" rows={3} /></div>
        </div>
        <div className="columns">
          <div className="column">
            <div className="field">
              <label className="label" style={labelStyle}>Level</label>
              <div className="control"><div className="select is-fullwidth"><select value={form.level} onChange={e => set('level', e.target.value)}><option>Undergraduate Intro</option><option>Undergraduate Upper Division</option><option>Graduate</option></select></div></div>
            </div>
          </div>
          <div className="column">
            <div className="field">
              <label className="label" style={labelStyle}>Delivery</label>
              <div className="control"><div className="select is-fullwidth"><select value={form.mode} onChange={e => set('mode', e.target.value)}><option>Online Asynchronous</option><option>Online Synchronous</option><option>Hybrid</option><option>In-Person</option></select></div></div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div style={{ background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 10, padding: 22, marginBottom: 14 }}>
        <p className="cf-mono" style={{ ...labelStyle, marginBottom: 9 }}>Semester Timeline</p>
        <div className="columns">
          <div className="column"><div className="field"><label className="label" style={labelStyle}>Start Date</label><div className="control"><input className="input" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} /></div></div></div>
          <div className="column"><div className="field"><label className="label" style={labelStyle}>End Date</label><div className="control"><input className="input" type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} /></div></div></div>
        </div>
        {form.startDate && form.endDate && (
          <div style={{ marginTop: -6, marginBottom: 12, padding: '7px 12px', background: 'var(--cf-gold-pale)', border: '1px solid rgba(184,134,11,0.25)', borderRadius: 6, fontSize: 12, color: 'var(--cf-ink)' }}>
            📅 <strong>{previewWeekCount} weeks</strong> calculated from your dates
            {previewWeekCount <= 10 && <span style={{ color: 'var(--cf-muted)', marginLeft: 8 }}>— Short/summer session pacing will be applied</span>}
          </div>
        )}
        <div className="field">
          <label className="label" style={labelStyle}>Holidays / Breaks (one per line)</label>
          <div className="control"><textarea className="textarea" value={form.holidays} onChange={e => set('holidays', e.target.value)} placeholder={'Thanksgiving Break: Nov 26–28\nSpring Break: Mar 10–14'} rows={2} /></div>
        </div>
      </div>

      {/* ── Tool Preferences ── */}
      <div style={{ background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 10, padding: 22, marginBottom: 14 }}>
        <p className="cf-mono" style={{ ...labelStyle, marginBottom: 4 }}>🛠 Tool Preferences</p>
        <p style={{ fontSize: 12, color: 'var(--cf-muted)', marginBottom: 14 }}>
          All generated assignments and Python activities will be tailored to these tools.
        </p>

        <div className="field" style={{ marginBottom: 14 }}>
          <label className="label" style={labelStyle}>🐍 Python Environment</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PYTHON_ENVS.map(opt => <button key={opt} onClick={() => setTool('python_env', opt)} style={chipBtn(toolPrefs.python_env === opt)}>{opt}</button>)}
          </div>
          {toolPrefs.python_env === 'Google Colab' && (
            <div style={{ marginTop: 7, padding: '7px 11px', background: 'var(--cf-sage-pale)', border: '1px solid rgba(58,92,58,0.2)', borderRadius: 6, fontSize: 11.5, color: 'var(--cf-sage)' }}>
              ✓ All Python assignments will include Google Colab links — no local installation required for students.
            </div>
          )}
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label className="label" style={labelStyle}>📤 Submission Format</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SUBMISSION_FORMATS.map(opt => <button key={opt} onClick={() => setTool('submission_format', opt)} style={chipBtn(toolPrefs.submission_format === opt)}>{opt}</button>)}
          </div>
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label className="label" style={labelStyle}>🗺 GIS Software</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {GIS_OPTIONS.map(opt => <button key={opt} onClick={() => setTool('gis_software', opt)} style={chipBtn(toolPrefs.gis_software === opt)}>{opt}</button>)}
          </div>
        </div>

        <div className="field">
          <label className="label" style={labelStyle}>📝 Additional Constraints</label>
          <textarea className="textarea" rows={2} value={toolPrefs.constraints} onChange={e => setTool('constraints', e.target.value)}
            placeholder="e.g. 'No prior programming experience', 'Lab computers cannot install software', 'Must use free tools only'…"
            style={{ fontSize: 13 }} />
        </div>
      </div>

      {/* ── Generation Options ── */}
      <div style={{ background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 10, padding: 22, marginBottom: 20 }}>
        <p className="cf-mono" style={{ ...labelStyle, marginBottom: 9 }}>Generation Options</p>
        <div className="columns">
          <div className="column">
            <div className="field">
              <label className="label" style={labelStyle}>Assignment Pattern</label>
              <div className="control"><div className="select is-fullwidth"><select value={form.pattern} onChange={e => set('pattern', e.target.value)}><option>Dossier / Portfolio</option><option>Weekly Labs</option><option>Project-Based</option><option>Mixed</option></select></div></div>
            </div>
          </div>
          <div className="column">
            <div className="field">
              <label className="label" style={labelStyle}>Style Source</label>
              <div className="control"><div className="select is-fullwidth"><select value={form.styleSource} onChange={e => set('styleSource', e.target.value)}><option value="all">All my uploaded courses ({courses.length})</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div></div>
            </div>
          </div>
        </div>

        {/* Activity Mode — replaces the old Python checkbox */}
        <div className="field" style={{ marginBottom: 16 }}>
          <label className="label" style={labelStyle}>🎯 Activity Type</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {([
              {
                k: 'python' as const,
                icon: '🐍',
                label: 'Python / Code',
                desc: 'Jupyter / Colab notebooks with runnable starter code and fill-in gaps',
              },
              {
                k: 'scenario' as const,
                icon: '🕵️',
                label: 'Scenario-Based',
                desc: 'Role-play detective exercises — students solve real problems without code',
              },
              {
                k: 'none' as const,
                icon: '✕',
                label: 'No Activities',
                desc: 'Readings and assignments only — no separate activity documents',
              },
            ] as { k: 'python' | 'scenario' | 'none'; icon: string; label: string; desc: string }[]).map(o => (
              <div
                key={o.k}
                onClick={() => setActivityMode(o.k)}
                style={{ padding: '12px 14px', border: `2px solid ${activityMode === o.k ? 'var(--cf-gold)' : 'var(--cf-line)'}`, borderRadius: 8, cursor: 'pointer', background: activityMode === o.k ? 'var(--cf-gold-pale)' : '#fff', transition: 'all .15s' }}
              >
                <div style={{ fontSize: 20, marginBottom: 5 }}>{o.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3, color: activityMode === o.k ? 'var(--cf-gold)' : 'var(--cf-ink)' }}>{o.label}</div>
                <div style={{ fontSize: 11, color: 'var(--cf-muted)', lineHeight: 1.5 }}>{o.desc}</div>
              </div>
            ))}
          </div>

          {activityMode === 'python' && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--cf-sage-pale)', border: '1px solid rgba(58,92,58,0.2)', borderRadius: 6, fontSize: 12, color: 'var(--cf-sage)' }}>
              ✓ Uses your Python environment preference: <strong>{toolPrefs.python_env}</strong>. Activities will include runnable starter code with intentional gaps for students to fill.
            </div>
          )}
          {activityMode === 'scenario' && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--cf-gold-pale)', border: '1px solid rgba(184,134,11,0.2)', borderRadius: 6, fontSize: 12, color: 'var(--cf-ink)' }}>
              ✓ No software required. Each activity puts students in a real-world professional role with a specific problem to solve — like your GIS Policy module. Readings will be generated as structured Quicademy-style modules.
            </div>
          )}
        </div>

        <p className="cf-mono" style={{ ...labelStyle, marginBottom: 9 }}>Also include</p>
        {([
          { k: 'news', label: '🌍 Inject current real-world examples & articles per week' },
          { k: 'bloom', label: "🧠 Run Bloom's Taxonomy alignment check" },
        ] as { k: keyof typeof options; label: string }[]).map(o => (
          <label key={o.k} className="checkbox" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={options[o.k]} onChange={e => setOptions(p => ({ ...p, [o.k]: e.target.checked }))} style={{ accentColor: 'var(--cf-gold)' }} />
            {o.label}
          </label>
        ))}
      </div>

      <button className="button is-ink is-medium" onClick={generate} disabled={generating}>
        {generating ? <span className="cf-spin mr-2" /> : '✦ '}
        Generate {previewWeekCount > 0 && previewWeekCount !== 15 ? `${previewWeekCount}-Week ` : ''}Course
      </button>
      <span style={{ fontSize: 11, color: 'var(--cf-muted)', marginLeft: 10 }}>~30 seconds</span>

      {/* Progress */}
      {(generating || result) && (
        <div style={{ background: 'var(--cf-paper2)', border: '1px solid var(--cf-line)', borderRadius: 10, padding: 24, marginTop: 20 }}>
          <p className="cf-serif" style={{ fontSize: 17, fontWeight: 300, fontStyle: 'italic', marginBottom: 5 }}>{stepTitle}</p>
          <p className="cf-mono" style={{ fontSize: 11, color: 'var(--cf-gold)', marginBottom: 10 }}>{stepSub}</p>
          {generating && <div className="cf-gen-bar"><div className="cf-gen-fill" style={{ width: `${progress}%` }} /></div>}
          {result && (
            <div>
              <div style={{ fontSize: 13, lineHeight: 1.7, maxHeight: 400, overflowY: 'auto', marginBottom: 14 }} dangerouslySetInnerHTML={{ __html: formatMD(result.text) }} />
              {result.courseId && (
                <button className="button is-sage" onClick={() => router.push(`/dashboard/courses/${result.courseId}`)}>
                  → View Course
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
