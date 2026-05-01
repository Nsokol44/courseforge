'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { createBrowserClient } from '@/lib/supabase-browser'
import toast from 'react-hot-toast'
import type { Course } from '@/types'

interface Props {
  course: Course
  onComplete: () => void
}

interface UploadedFile {
  name: string
  type: string
  size: number
  text: string
}

const EXT_ICON: Record<string, string> = {
  pdf: '📄', docx: '📝', pptx: '📊', imscc: '📦', txt: '📃', ipynb: '🐍',
}

export default function CourseUploadMaterials({ course, onComplete }: Props) {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [saving, setSaving] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const supabase = createBrowserClient()

  const onDrop = useCallback((accepted: File[]) => {
    accepted.forEach(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      const reader = new FileReader()
      reader.onload = e => {
        const text = ['txt', 'ipynb'].includes(ext)
          ? (e.target?.result as string).slice(0, 3500)
          : `[${file.name} — ${ext.toUpperCase()} — ${(file.size / 1024).toFixed(0)}KB]`
        setFiles(prev => {
          if (prev.find(f => f.name === file.name)) return prev
          return [...prev, { name: file.name, type: ext, size: file.size, text }]
        })
      }
      if (['txt', 'ipynb'].includes(ext)) reader.readAsText(file)
      else reader.readAsDataURL(file)
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/plain': ['.txt'],
      'application/zip': ['.imscc'],
      'application/json': ['.ipynb'],
    },
  })

  async function saveFiles() {
    if (!files.length) { toast.error('Add at least one file'); return }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Save file metadata to course_files
      const { error } = await supabase.from('course_files').insert(
        files.map(f => ({
          course_id: course.id,
          user_id: user.id,
          filename: f.name,
          file_type: f.type,
          extracted_text: f.text.slice(0, 4000),
        }))
      )
      if (error) throw error

      toast.success(`${files.length} file(s) added to ${course.title}`)
      setFiles([])
      onComplete()
      setOpen(false)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function reanalyzeStyle() {
    if (!files.length) { toast.error('Upload files first'); return }
    setReanalyzing(true)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files.map(f => ({ name: f.name, type: f.type, text: f.text })),
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      // Update the course's style profile
      await supabase.from('courses')
        .update({ style_profile: data.profile })
        .eq('id', course.id)

      toast.success('Teaching style profile updated from new materials')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setReanalyzing(false)
    }
  }

  return (
    <>
      <button
        className="button is-small is-ghost"
        onClick={() => setOpen(true)}
        title="Upload additional course materials"
        style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--cf-muted)' }}
      >
        📂 Upload Materials
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(11,12,15,0.6)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget && !saving) setOpen(false) }}
        >
          <div style={{ background: 'var(--cf-paper)', border: '1px solid var(--cf-line)', borderRadius: 14, width: 580, maxWidth: '95vw', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--cf-line)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="cf-serif" style={{ fontSize: 20, fontWeight: 500, marginBottom: 3 }}>
                    Upload <em style={{ color: 'var(--cf-gold)' }}>Materials</em>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--cf-muted)' }}>
                    Add files to <strong>{course.title}</strong> — the AI will reference these when generating assignments, enriching weeks, and answering questions.
                  </div>
                </div>
                {!saving && (
                  <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 19, cursor: 'pointer', color: 'var(--cf-muted2)', marginLeft: 12 }}>✕</button>
                )}
              </div>
            </div>

            {/* Existing files */}
            {course.course_files && course.course_files.length > 0 && (
              <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--cf-line)', flexShrink: 0, background: 'var(--cf-paper2)' }}>
                <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 7 }}>
                  Already attached ({course.course_files.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {course.course_files.map(f => (
                    <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 20, fontSize: 11.5, color: 'var(--cf-muted)' }}>
                      {EXT_ICON[f.file_type || ''] || '📁'} {f.filename}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Drop zone */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>
              <div {...getRootProps()} className={`cf-dropzone ${isDragActive ? 'is-active' : ''}`} style={{ marginBottom: 12 }}>
                <input {...getInputProps()} />
                <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 4 }}>
                  {isDragActive ? 'Drop files here' : 'Drop additional course materials here'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--cf-muted)' }}>
                  Syllabi, assignment sheets, lecture notes, readings, notebooks — .pdf, .docx, .pptx, .txt, .ipynb, .imscc
                </div>
              </div>

              {/* Staged files */}
              {files.map(f => (
                <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 7, fontSize: 12, marginBottom: 5 }}>
                  <span style={{ fontSize: 16 }}>{EXT_ICON[f.type] || '📁'}</span>
                  <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)' }}>{(f.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => setFiles(p => p.filter(x => x.name !== f.name))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cf-muted2)', fontSize: 14 }}>×</button>
                </div>
              ))}

              {/* What these materials are used for */}
              <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--cf-gold-pale)', border: '1px solid rgba(184,134,11,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--cf-ink)' }}>
                <strong>How these files are used:</strong>
                <ul style={{ marginTop: 6, paddingLeft: 16, lineHeight: 1.8, color: 'var(--cf-muted)' }}>
                  <li>Referenced when you ask the AI questions about this course</li>
                  <li>Used as style context when generating new courses or assignments</li>
                  <li>Available as source material for Deep Enrich</li>
                  <li>Can trigger a style profile re-analysis (see button below)</li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--cf-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: 10 }}>
              <button
                className="button is-small"
                onClick={reanalyzeStyle}
                disabled={reanalyzing || !files.length}
                title="Update this course's teaching style profile from the new files"
                style={{ fontSize: 12, color: 'var(--cf-sage)', borderColor: 'rgba(58,92,58,0.3)' }}
              >
                {reanalyzing ? <span className="cf-spin" style={{ marginRight: 5 }} /> : '✦ '}
                Re-analyze Style Profile
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
                <button className="button is-gold" onClick={saveFiles} disabled={saving || !files.length}>
                  {saving ? <span className="cf-spin" style={{ marginRight: 6 }} /> : null}
                  Save {files.length > 0 ? `${files.length} File${files.length > 1 ? 's' : ''}` : 'Files'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
