'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import toast from 'react-hot-toast'
import type { ToolPreferences, Course } from '@/types'

interface Props {
  course: Course
  onSave: (prefs: ToolPreferences) => void
}

const DEFAULTS: ToolPreferences = {
  python_env: 'Google Colab',
  gis_software: 'QGIS',
  submission_format: 'Google Colab Link',
  lms: 'Canvas',
  custom_tools: [],
  constraints: '',
}

const PYTHON_ENVS = ['Google Colab', 'Jupyter Notebook', 'JupyterLab', 'VS Code', 'Local Python', 'None']
const GIS_OPTIONS = ['QGIS', 'ArcGIS Pro', 'ArcGIS Online', 'GeoPandas only', 'None']
const SUBMISSION_FORMATS = ['Google Colab Link', 'Jupyter Notebook (.ipynb)', 'PDF', 'Word Document', 'Canvas Quiz', 'GitHub Repository', 'Any']
const LMS_OPTIONS = ['Canvas', 'Blackboard', 'Moodle', 'D2L Brightspace', 'Google Classroom', 'Other']

export default function CoursePreferences({ course, onSave }: Props) {
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState<ToolPreferences>(
    course.tool_preferences ?? { ...DEFAULTS }
  )
  const [customTool, setCustomTool] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createBrowserClient()

  const set = (k: keyof ToolPreferences, v: any) => setPrefs(p => ({ ...p, [k]: v }))

  function addCustomTool() {
    if (!customTool.trim()) return
    set('custom_tools', [...(prefs.custom_tools || []), customTool.trim()])
    setCustomTool('')
  }

  function removeCustomTool(t: string) {
    set('custom_tools', prefs.custom_tools.filter(x => x !== t))
  }

  async function save() {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('courses')
        .update({ tool_preferences: prefs })
        .eq('id', course.id)
      if (error) throw error
      onSave(prefs)
      setOpen(false)
      toast.success('Tool preferences saved — AI will use these in all future requests')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const hasPrefs = course.tool_preferences && Object.keys(course.tool_preferences).length > 0
  const labelStyle = { fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: 'var(--cf-muted)', fontFamily: 'var(--cf-mono)', display: 'block', marginBottom: 5 }

  return (
    <>
      <button
        className="button is-small is-ghost"
        onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, color: hasPrefs ? 'var(--cf-sage)' : 'var(--cf-muted)' }}
        title="Configure tool preferences for AI generation"
      >
        ⚙ {hasPrefs ? `Tools: ${course.tool_preferences!.python_env}` : 'Set Tool Preferences'}
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(11,12,15,0.6)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div style={{ background: 'var(--cf-paper)', border: '1px solid var(--cf-line)', borderRadius: 14, width: 560, maxWidth: '95vw', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--cf-line)', flexShrink: 0 }}>
              <div className="cf-serif" style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>
                ⚙ Tool <em style={{ color: 'var(--cf-gold)' }}>Preferences</em>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--cf-muted)' }}>
                These settings are injected into every AI prompt for this course — assignments, Python activities, and enrichment will all reference these tools.
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>
              {/* Python Environment */}
              <div className="field" style={{ marginBottom: 16 }}>
                <label style={labelStyle}>🐍 Python Environment</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PYTHON_ENVS.map(opt => (
                    <button
                      key={opt}
                      onClick={() => set('python_env', opt)}
                      style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${prefs.python_env === opt ? 'var(--cf-gold)' : 'var(--cf-line2)'}`, background: prefs.python_env === opt ? 'var(--cf-gold-pale)' : '#fff', color: prefs.python_env === opt ? 'var(--cf-gold)' : 'var(--cf-muted)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--cf-sans)', transition: 'all .15s', fontWeight: prefs.python_env === opt ? 600 : 400 }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                {prefs.python_env === 'Google Colab' && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--cf-sage-pale)', border: '1px solid rgba(58,92,58,0.2)', borderRadius: 6, fontSize: 12, color: 'var(--cf-sage)' }}>
                    ✓ AI will generate all Python assignments as shareable Google Colab links — no local setup required for students.
                  </div>
                )}
              </div>

              {/* Submission Format */}
              <div className="field" style={{ marginBottom: 16 }}>
                <label style={labelStyle}>📤 Submission Format</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SUBMISSION_FORMATS.map(opt => (
                    <button
                      key={opt}
                      onClick={() => set('submission_format', opt)}
                      style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${prefs.submission_format === opt ? 'var(--cf-gold)' : 'var(--cf-line2)'}`, background: prefs.submission_format === opt ? 'var(--cf-gold-pale)' : '#fff', color: prefs.submission_format === opt ? 'var(--cf-gold)' : 'var(--cf-muted)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--cf-sans)', transition: 'all .15s', fontWeight: prefs.submission_format === opt ? 600 : 400 }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* GIS Software */}
              <div className="field" style={{ marginBottom: 16 }}>
                <label style={labelStyle}>🗺 GIS Software</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {GIS_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      onClick={() => set('gis_software', opt)}
                      style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${prefs.gis_software === opt ? 'var(--cf-gold)' : 'var(--cf-line2)'}`, background: prefs.gis_software === opt ? 'var(--cf-gold-pale)' : '#fff', color: prefs.gis_software === opt ? 'var(--cf-gold)' : 'var(--cf-muted)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--cf-sans)', transition: 'all .15s', fontWeight: prefs.gis_software === opt ? 600 : 400 }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* LMS */}
              <div className="field" style={{ marginBottom: 16 }}>
                <label style={labelStyle}>🎓 Learning Management System</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {LMS_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      onClick={() => set('lms', opt)}
                      style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${prefs.lms === opt ? 'var(--cf-gold)' : 'var(--cf-line2)'}`, background: prefs.lms === opt ? 'var(--cf-gold-pale)' : '#fff', color: prefs.lms === opt ? 'var(--cf-gold)' : 'var(--cf-muted)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--cf-sans)', transition: 'all .15s', fontWeight: prefs.lms === opt ? 600 : 400 }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Tools */}
              <div className="field" style={{ marginBottom: 16 }}>
                <label style={labelStyle}>🔧 Additional Tools / Libraries</label>
                <div style={{ display: 'flex', gap: 7, marginBottom: 8 }}>
                  <input
                    className="input is-small"
                    value={customTool}
                    onChange={e => setCustomTool(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustomTool()}
                    placeholder="e.g. GeoPandas, Rasterio, Folium, R Studio…"
                    style={{ flex: 1 }}
                  />
                  <button className="button is-small is-ink" onClick={addCustomTool}>Add</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {(prefs.custom_tools || []).map(t => (
                    <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', background: 'var(--cf-paper2)', border: '1px solid var(--cf-line2)', borderRadius: 20, fontSize: 12, color: 'var(--cf-ink)' }}>
                      {t}
                      <button onClick={() => removeCustomTool(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cf-muted2)', fontSize: 13, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Constraints / Notes */}
              <div className="field">
                <label style={labelStyle}>📝 Additional Constraints or Notes for AI</label>
                <textarea
                  className="textarea"
                  rows={3}
                  value={prefs.constraints}
                  onChange={e => set('constraints', e.target.value)}
                  placeholder="e.g. 'Students have no prior programming experience', 'Lab computers cannot install software', 'All work must be accessible offline'…"
                  style={{ fontSize: 13 }}
                />
                <div style={{ fontSize: 11, color: 'var(--cf-muted2)', marginTop: 5 }}>
                  This text is included verbatim in every AI prompt for this course.
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--cf-line)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
              <button className="button" onClick={() => setOpen(false)}>Cancel</button>
              <button className="button is-gold" onClick={save} disabled={saving}>
                {saving ? <span className="cf-spin" style={{ marginRight: 6 }} /> : null}
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
