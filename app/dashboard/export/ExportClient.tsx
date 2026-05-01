'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

interface Props {
  courses: any[]
}

// ── Canvas Common Cartridge helpers ──────────────────────────────────────

function uid() { return 'r' + crypto.randomUUID().replace(/-/g, '') }

function escapeXml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function htmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Wraps plain text in a minimal HTML document body */
function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeXml(title)}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.7;color:#1a1a1a;max-width:820px;margin:40px auto;padding:0 24px}
h1{font-size:1.4em;margin-bottom:4px}h2{font-size:1.1em;margin:24px 0 6px}
.meta{color:#666;font-size:.85em;margin-bottom:20px}
.section{margin-top:20px;padding-top:16px;border-top:1px solid #eee}
pre,code{background:#f5f5f5;padding:2px 6px;border-radius:3px;font-size:.9em}
</style></head>
<body>${body}</body></html>`
}

/** Build the imsmanifest.xml — the Canvas import map */
function buildManifest(
  course: any,
  items: Array<{ id: string; title: string; type: string; href: string }>
): string {
  const manifestId = uid()

  // Group items by week for the organization tree
  const weekMap = new Map<number, typeof items>()
  items.forEach(item => {
    const wn = (item as any).weekNumber ?? 0
    if (!weekMap.has(wn)) weekMap.set(wn, [])
    weekMap.get(wn)!.push(item)
  })

  const orgItems = Array.from(weekMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([wn, wItems]) => {
      const week = course.weeks?.find((w: any) => w.week_number === wn)
      const weekTitle = wn === 0
        ? 'Course Content'
        : `Week ${wn}${week?.topic ? ': ' + week.topic : ''}`
      const children = wItems.map(item => `
        <item identifier="i_${uid()}" identifierref="${item.id}">
          <title>${escapeXml(item.title)}</title>
        </item>`).join('')
      return `
    <item identifier="w_${uid()}">
      <title>${escapeXml(weekTitle)}</title>
      ${children}
    </item>`
    }).join('')

  const resources = items.map(item => {
    if (item.type === 'assignment') {
      return `
    <resource identifier="${item.id}" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="${item.href}">
      <file href="${item.href}"/>
      <dependency identifierref="${item.id}_meta"/>
    </resource>
    <resource identifier="${item.id}_meta" type="assignment_xmlv1p0">
      <file href="${item.href.replace('.html', '_meta.xml')}"/>
    </resource>`
    }
    if (item.type === 'discussion') {
      return `
    <resource identifier="${item.id}" type="imsdt_xmlv1p1">
      <file href="${item.href}"/>
    </resource>`
    }
    // page / wiki_content
    return `
    <resource identifier="${item.id}" type="webcontent" href="${item.href}">
      <file href="${item.href}"/>
    </resource>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${manifestId}"
  xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1"
  xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1
    http://www.imsglobal.org/profile/cc/ccv1p1/ccv1p1_imscp_v1p2_v1p0.xsd">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.1.0</schemaversion>
    <lomimscc:lom>
      <lomimscc:general>
        <lomimscc:title><lomimscc:string>${escapeXml(course.title)}</lomimscc:string></lomimscc:title>
      </lomimscc:general>
    </lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org_1" structure="rooted-hierarchy">
      <item identifier="LearningModules">${orgItems}
      </item>
    </organization>
  </organizations>
  <resources>${resources}
  </resources>
</manifest>`
}

/** Canvas assignment meta XML — makes it a gradable assignment with points */
function buildAssignmentMeta(title: string, points: number, description: string, href: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<assignment xmlns="http://canvas.instructure.com/xsd/cccv1p0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0
    http://canvas.instructure.com/xsd/cccv1p0.xsd">
  <title>${escapeXml(title)}</title>
  <due_at/>
  <lock_at/>
  <unlock_at/>
  <module_locked>false</module_locked>
  <workflow_state>published</workflow_state>
  <assignment_overrides/>
  <points_possible>${points}</points_possible>
  <grading_type>points</grading_type>
  <all_day>false</all_day>
  <submission_types>online_text_entry,online_upload</submission_types>
  <external_tool_url/>
  <turnitin_enabled>false</turnitin_enabled>
  <allowed_extensions/>
  <has_group_category>false</has_group_category>
  <grading_standard_id/>
  <grader_count>0</grader_count>
  <body>${escapeXml(description)}</body>
</assignment>`
}

/** Canvas discussion topic XML */
function buildDiscussionXml(title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<topic xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1
    http://www.imsglobal.org/profile/cc/ccv1p1/ccv1p1_imsdt_v1p0.xsd">
  <title>${escapeXml(title)}</title>
  <text texttype="text/html"><![CDATA[${body}]]></text>
  <type>threaded</type>
</topic>`
}

// ── Main export function ──────────────────────────────────────────────────

async function buildExport(course: any, mode: 'canvas' | 'zip'): Promise<Blob> {
  const JSZip = (window as any).JSZip
  if (!JSZip) throw new Error('JSZip not loaded — please refresh the page')
  const zip = new JSZip()

  const registeredItems: Array<{ id: string; title: string; type: string; href: string; weekNumber: number }> = []

  function register(title: string, type: string, folder: string, ext: string, weekNumber: number) {
    const id = uid()
    const slug = title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60)
    const href = `${folder}/${slug}_${id.slice(0, 8)}.${ext}`
    registeredItems.push({ id, title, type, href, weekNumber })
    return { id, href }
  }

  // ── 1. Assignments ──
  for (const a of course.assignments || []) {
    const weekNumber = parseInt((a.week || '').replace(/\D/g, '')) || 0
    const typeSlug = (a.type || 'assignment').toLowerCase()
    const isDiscussion = typeSlug === 'discussion'

    const descriptionHtml = a.description
      ? `<p>${a.description.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`
      : '<p><em>No description provided.</em></p>'

    if (mode === 'canvas') {
      if (isDiscussion) {
        const { id, href } = register(a.title, 'discussion', 'discussions', 'xml', weekNumber)
        zip.file(href, buildDiscussionXml(a.title, descriptionHtml))
      } else {
        const { id, href } = register(a.title, 'assignment', 'assignments', 'html', weekNumber)
        zip.file(href, wrapHtml(a.title, `
          <h1>${escapeXml(a.title)}</h1>
          <p class="meta">${escapeXml(a.type || 'Assignment')} · ${a.points || 0} points${a.due_date ? ' · Due: ' + a.due_date : ''}</p>
          ${descriptionHtml}`))
        zip.file(href.replace('.html', '_meta.xml'), buildAssignmentMeta(a.title, a.points || 0, a.description || '', href))
      }
    } else {
      // ZIP — human-readable HTML
      const folder = isDiscussion ? 'Discussions' : 'Assignments'
      const { href } = register(a.title, 'page', folder, 'html', weekNumber)
      zip.file(href, wrapHtml(a.title, `
        <h1>${escapeXml(a.title)}</h1>
        <p class="meta"><strong>${escapeXml(a.type || 'Assignment')}</strong> · ${a.points || 0} pts${a.week ? ' · ' + a.week : ''}${a.due_date ? ' · Due: ' + escapeXml(a.due_date) : ''}</p>
        <div class="section">${descriptionHtml}</div>`))
    }
  }

  // ── 2. Python Activities ──
  for (const p of course.python_activities || []) {
    const weekNumber = parseInt((p.week || '').replace(/\D/g, '')) || 0
    const codeBlock = p.code
      ? `<h2>Starter Code</h2><pre><code>${escapeXml(p.code)}</code></pre>`
      : ''
    const body = `<h1>${escapeXml(p.title)}</h1>
      <p class="meta">Python Activity · ${escapeXml(p.week || '')}</p>
      ${p.description ? `<p>${escapeXml(p.description)}</p>` : ''}
      ${codeBlock}`

    if (mode === 'canvas') {
      const { href } = register(p.title, 'assignment', 'assignments', 'html', weekNumber)
      zip.file(href, wrapHtml(p.title, body))
      zip.file(href.replace('.html', '_meta.xml'), buildAssignmentMeta(p.title, 0, p.description || '', href))
    } else {
      const { href } = register(p.title, 'page', 'Labs', 'html', weekNumber)
      zip.file(href, wrapHtml(p.title, body))
    }
  }

  // ── 3. Week overview pages ──
  for (const w of course.weeks || []) {
    const weekTitle = `Week ${w.week_number}: ${w.topic || 'Overview'}`
    const readingsList = (w.readings || []).length
      ? `<h2>Readings</h2><ul>${(w.readings || []).map((r: any) => {
          const text = typeof r === 'string' ? r : [r.author, r.title].filter(Boolean).join(', ')
          return `<li>${escapeXml(text)}</li>`
        }).join('')}</ul>`
      : ''
    const body = `
      <h1>${escapeXml(weekTitle)}</h1>
      ${w.dates ? `<p class="meta">${escapeXml(w.dates)}</p>` : ''}
      ${w.concept_overview ? `<h2>Concept Overview</h2><p>${escapeXml(w.concept_overview)}</p>` : ''}
      ${w.week_description && !w.concept_overview ? `<p>${escapeXml(w.week_description)}</p>` : ''}
      ${readingsList}`

    const folder = mode === 'canvas' ? 'wiki_content' : `Week ${w.week_number}`
    const { href } = register(weekTitle, 'page', folder, 'html', w.week_number)
    zip.file(href, wrapHtml(weekTitle, body))
  }

  // ── 4. Real-world items as pages ──
  for (const r of course.realworld_items || []) {
    const weekNumber = parseInt((r.week || '').replace(/\D/g, '')) || 0
    const body = `<h1>${escapeXml(r.title)}</h1>
      <p class="meta">${escapeXml(r.source || '')}${r.url ? ` · <a href="${escapeXml(r.url)}">${escapeXml(r.url)}</a>` : ''}</p>
      <p>${escapeXml(r.description || '')}</p>`

    const folder = mode === 'canvas' ? 'wiki_content' : 'Real-World Examples'
    const { href } = register(r.title, 'page', folder, 'html', weekNumber)
    zip.file(href, wrapHtml(r.title, body))
  }

  // ── 5. Manifest or README ──
  if (mode === 'canvas') {
    zip.file('imsmanifest.xml', buildManifest(course, registeredItems))
  } else {
    zip.file('README.txt',
      `Course: ${course.title}\n` +
      `Number: ${course.number || '—'}\n` +
      `Term: ${course.term || '—'}\n` +
      `Total Points: ${course.total_points || 0}\n` +
      `Weeks: ${course.weeks?.length || 0}\n` +
      `Assignments: ${course.assignments?.length || 0}\n` +
      `Generated: ${new Date().toLocaleString()}\n`)
  }

  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ExportClient({ courses }: Props) {
  const [selected, setSelected] = useState<string>(courses[0]?.id || '')
  const [exporting, setExporting] = useState<'canvas' | 'zip' | null>(null)

  async function handleExport(mode: 'canvas' | 'zip') {
    const course = courses.find(c => c.id === selected)
    if (!course) { toast.error('Select a course first'); return }

    setExporting(mode)
    try {
      const blob = await buildExport(course, mode)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const slug = (course.number || course.title).replace(/[^a-z0-9]/gi, '-').toLowerCase()
      a.download = `${slug}.${mode === 'canvas' ? 'imscc' : 'zip'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      const wks = course.weeks?.length || 0
      const asgs = course.assignments?.length || 0
      toast.success(mode === 'canvas'
        ? `Canvas package ready — ${wks} weeks, ${asgs} assignments`
        : `ZIP downloaded — ${wks} weeks, ${asgs} assignments`)
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`)
      console.error(err)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <p className="cf-serif" style={{ fontSize: 24, fontWeight: 300, fontStyle: 'italic', marginBottom: 5 }}>Export Course Content</p>
      <p style={{ fontSize: 13, color: 'var(--cf-muted)', marginBottom: 22 }}>
        Generate a Canvas-ready <code>.imscc</code> package or a ZIP archive for local use.
      </p>

      {/* Course selector */}
      <div style={{ background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 10, padding: 22, marginBottom: 14 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>Select Course</p>
        {courses.length === 0 ? (
          <p style={{ color: 'var(--cf-muted)', fontSize: 13 }}>No courses found.</p>
        ) : courses.map(c => (
          <div key={c.id} onClick={() => setSelected(c.id)}
            style={{ padding: '10px 13px', border: `1px solid ${selected === c.id ? 'rgba(184,134,11,0.4)' : 'var(--cf-line)'}`, borderRadius: 7, cursor: 'pointer', background: selected === c.id ? 'var(--cf-gold-pale)' : '#fff', marginBottom: 7, transition: 'all .15s' }}>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{c.number ? `${c.number} — ` : ''}{c.title}</div>
            <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', marginTop: 3, display: 'flex', gap: 10 }}>
              <span>{c.term || '—'}</span>
              <span>{c.weeks?.length || 0} weeks</span>
              <span>{c.assignments?.length || 0} assignments</span>
              <span>{c.total_points || 0} pts</span>
            </div>
          </div>
        ))}
      </div>

      {/* What will be exported */}
      {selected && (() => {
        const c = courses.find(x => x.id === selected)
        if (!c) return null
        return (
          <div style={{ background: 'var(--cf-paper2)', border: '1px solid var(--cf-line)', borderRadius: 8, padding: '12px 16px', marginBottom: 14, fontSize: 12.5, color: 'var(--cf-muted)' }}>
            <strong style={{ color: 'var(--cf-ink)' }}>Will export:</strong>
            <span style={{ marginLeft: 8 }}>{c.weeks?.length || 0} week overview pages</span>
            <span style={{ marginLeft: 8 }}>· {c.assignments?.length || 0} assignments</span>
            <span style={{ marginLeft: 8 }}>· {c.python_activities?.length || 0} Python activities</span>
            <span style={{ marginLeft: 8 }}>· {c.realworld_items?.length || 0} real-world pages</span>
          </div>
        )
      })()}

      {/* Export buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="button is-ink" style={{ flex: 1, padding: '13px', height: 'auto' }}
          onClick={() => handleExport('canvas')} disabled={!selected || !!exporting}>
          {exporting === 'canvas' ? <><span className="cf-spin" style={{ marginRight: 6 }} />Building…</> : '↓ Export for Canvas (.imscc)'}
        </button>
        <button className="button" style={{ flex: 1, padding: '13px', height: 'auto', background: '#fff', border: '1px solid var(--cf-line)', color: 'var(--cf-ink)' }}
          onClick={() => handleExport('zip')} disabled={!selected || !!exporting}>
          {exporting === 'zip' ? <><span className="cf-spin" style={{ marginRight: 6 }} />Building…</> : '↓ Download as ZIP'}
        </button>
      </div>

      <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--cf-muted2)', lineHeight: 1.7 }}>
        <strong>Canvas import:</strong> In Canvas, go to <em>Settings → Import Course Content → Common Cartridge 1.x Package</em> and upload the <code>.imscc</code> file.
        All assignments import with points and appear in the Modules view.
      </div>
    </div>
  )
}
