'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

interface Props { courses: any[] }

// ─── Helpers ────────────────────────────────────────────────────────────────

function uid() { return 'g' + crypto.randomUUID().replace(/-/g, '') }

function escXml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 50)
}

function descToHtml(text: string): string {
  if (!text) return '<p><em>No description provided.</em></p>'
  // Already has HTML tags — use as-is
  if (text.includes('<p>') || text.includes('<div>')) return text
  // Plain text — wrap paragraphs
  return text.split(/\n\n+/).map(p => `<p>${escXml(p.trim())}</p>`).filter(p => p !== '<p></p>').join('\n') || `<p>${escXml(text)}</p>`
}

// ─── Canvas-native assignment XML (assignment_xmlv1p0) ─────────────────────
// The body MUST be HTML, workflow_state must be "published" for editability
function assignmentXml(id: string, title: string, points: number, description: string, dueAt: string): string {
  const htmlBody = descToHtml(description)
  return `<?xml version="1.0" encoding="UTF-8"?>
<assignment identifier="${id}"
  xmlns="http://canvas.instructure.com/xsd/cccv1p0"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 http://canvas.instructure.com/xsd/cccv1p0.xsd">
  <title>${escXml(title)}</title>
  <due_at>${dueAt || ''}</due_at>
  <lock_at/>
  <unlock_at/>
  <module_locked>false</module_locked>
  <workflow_state>published</workflow_state>
  <assignment_overrides/>
  <points_possible>${points || 0}</points_possible>
  <grading_type>points</grading_type>
  <submission_types>online_text_entry,online_upload</submission_types>
  <turnitin_enabled>false</turnitin_enabled>
  <peer_reviews>false</peer_reviews>
  <automatic_peer_reviews>false</automatic_peer_reviews>
  <anonymous_submissions>false</anonymous_submissions>
  <allowed_extensions/>
  <has_group_category>false</has_group_category>
  <grading_standard_id/>
  <body>${escXml(htmlBody)}</body>
</assignment>`
}

// ─── Canvas discussion XML (imsdt_xmlv1p1) ────────────────────────────────
function discussionXml(title: string, body: string): string {
  const htmlBody = descToHtml(body)
  return `<?xml version="1.0" encoding="UTF-8"?>
<topic xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1 http://www.imsglobal.org/profile/cc/ccv1p1/ccv1p1_imsdt_v1p0.xsd">
  <title>${escXml(title)}</title>
  <text texttype="text/html"><![CDATA[${htmlBody}]]></text>
  <type>threaded</type>
  <workflow_state>active</workflow_state>
</topic>`
}

// ─── Canvas wiki page HTML ──────────────────────────────────────────────────
// Pages go in wiki_content/ and use type="webcontent" — Canvas makes them editable Pages
function wikiPageHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <title>${escXml(title)}</title>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

// ─── imsmanifest.xml ─────────────────────────────────────────────────────────
interface ManifestItem {
  id: string
  title: string
  contentType: 'assignment' | 'discussion' | 'page'
  href: string           // main file path
  metaHref?: string      // assignment meta XML path
  weekNumber: number
}

function buildManifest(courseTitle: string, items: ManifestItem[], weeks: any[]): string {
  const manifestId = uid()

  // Build organization tree grouped by week
  const weekMap = new Map<number, ManifestItem[]>()
  for (const item of items) {
    if (!weekMap.has(item.weekNumber)) weekMap.set(item.weekNumber, [])
    weekMap.get(item.weekNumber)!.push(item)
  }

  const orgItems = Array.from(weekMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([wn, wItems]) => {
      const week = weeks.find((w: any) => w.week_number === wn)
      const weekTitle = wn === 0 ? 'General' : `Week ${wn}${week?.topic ? ': ' + week.topic : ''}`
      const children = wItems.map(item => `
      <item identifier="item_${uid()}" identifierref="${item.id}">
        <title>${escXml(item.title)}</title>
      </item>`).join('')
      return `
    <item identifier="mod_${uid()}">
      <title>${escXml(weekTitle)}</title>${children}
    </item>`
    }).join('')

  const resources = items.map(item => {
    if (item.contentType === 'assignment') {
      // Canvas requires: associatedcontent resource pointing to the HTML body,
      // with a dependency on the assignment_xmlv1p0 meta resource
      return `
    <resource identifier="${item.id}" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="${item.href}">
      <file href="${item.href}"/>
      <dependency identifierref="${item.id}_settings"/>
    </resource>
    <resource identifier="${item.id}_settings" type="assignment_xmlv1p0">
      <file href="${item.metaHref}"/>
    </resource>`
    }
    if (item.contentType === 'discussion') {
      return `
    <resource identifier="${item.id}" type="imsdt_xmlv1p1">
      <file href="${item.href}"/>
    </resource>`
    }
    // Wiki page — webcontent in wiki_content/ = editable Canvas Page
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
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/profile/cc/ccv1p1/ccv1p1_imscp_v1p2_v1p0.xsd">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.1.0</schemaversion>
    <lomimscc:lom>
      <lomimscc:general>
        <lomimscc:title><lomimscc:string>${escXml(courseTitle)}</lomimscc:string></lomimscc:title>
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

// ─── Main build function ─────────────────────────────────────────────────────

async function buildExport(course: any, mode: 'canvas' | 'zip'): Promise<Blob> {
  const JSZip = (window as any).JSZip
  if (!JSZip) throw new Error('JSZip not loaded — please refresh the page')
  const zip = new JSZip()
  const manifestItems: ManifestItem[] = []

  // ── 1. Week overview pages (wiki_content/*.html) ───────────────────────
  for (const w of course.weeks || []) {
    const id = uid()
    const weekTitle = `Week ${w.week_number}: ${w.topic || 'Overview'}`
    const weekSlug = `week_${w.week_number}_${slug(w.topic || 'overview')}`

    // Build rich HTML body for the week overview page
    const readingsList = (w.readings || []).length
      ? `<h2>Readings</h2><ul>${(w.readings || [])
          .map((r: any) => {
            const text = typeof r === 'string' ? r : [r.author, r.title].filter(Boolean).join(', ')
            return `<li>${escXml(text)}</li>`
          }).join('')}</ul>`
      : ''

    const resourcesList = (w.reinforcement_materials || []).length
      ? `<h2>Resources</h2><ul>${(w.reinforcement_materials || [])
          .map((m: any) => `<li><a href="${escXml(m.url || '#')}">${escXml(m.title)}</a> — ${escXml(m.description || '')}</li>`)
          .join('')}</ul>`
      : ''

    const bodyHtml = `
<h2>Concept Overview</h2>
<p>${escXml(w.concept_overview || w.week_description || `Week ${w.week_number}: ${w.topic}`)}</p>
${readingsList}
${resourcesList}`.trim()

    const href = mode === 'canvas'
      ? `wiki_content/${weekSlug}.html`
      : `Week ${w.week_number}/${weekSlug}.html`

    zip.file(href, wikiPageHtml(weekTitle, bodyHtml))
    if (mode === 'canvas') {
      manifestItems.push({ id, title: weekTitle, contentType: 'page', href, weekNumber: w.week_number })
    }
  }

  // ── 2. Assignments ────────────────────────────────────────────────────
  for (const a of course.assignments || []) {
    const weekNumber = parseInt((a.week || '').replace(/\D/g, '')) || 0
    const typeSlug = (a.type || '').toLowerCase()
    const isDiscussion = typeSlug === 'discussion'
    const id = uid()
    const fileSlug = slug(a.title)

    if (mode === 'canvas') {
      if (isDiscussion) {
        // Canvas discussion
        const href = `${id}/${fileSlug}.xml`
        zip.file(href, discussionXml(a.title, a.description || ''))
        manifestItems.push({ id, title: a.title, contentType: 'discussion', href, weekNumber })
      } else {
        // Canvas gradable assignment
        // Body HTML file (shown to students)
        const href = `${id}/${fileSlug}.html`
        const metaHref = `${id}/${fileSlug}_settings.xml`
        const htmlBody = `<h2>${escXml(a.title)}</h2>\n${descToHtml(a.description || '')}`
        zip.file(href, wikiPageHtml(a.title, htmlBody))
        // Assignment settings XML (points, submission type, grading)
        zip.file(metaHref, assignmentXml(id, a.title, a.points || 0, a.description || '', a.due_date || ''))
        manifestItems.push({ id, title: a.title, contentType: 'assignment', href, metaHref, weekNumber })
      }
    } else {
      // ZIP mode — human-readable HTML
      const folder = isDiscussion ? 'Discussions' : 'Assignments'
      const href = `${folder}/${fileSlug}.html`
      const body = `<h1>${escXml(a.title)}</h1>
<p><strong>Type:</strong> ${escXml(a.type || 'Assignment')} &nbsp;|&nbsp; <strong>Points:</strong> ${a.points || 0}${a.week ? ` &nbsp;|&nbsp; <strong>Week:</strong> ${escXml(a.week)}` : ''}${a.due_date ? ` &nbsp;|&nbsp; <strong>Due:</strong> ${escXml(a.due_date)}` : ''}</p>
<hr/>
${descToHtml(a.description || '')}`
      zip.file(href, wikiPageHtml(a.title, body))
    }
  }

  // ── 3. Python activities ───────────────────────────────────────────────
  for (const p of course.python_activities || []) {
    const weekNumber = parseInt((p.week || '').replace(/\D/g, '')) || 0
    const id = uid()
    const fileSlug = slug(p.title)
    const isScenario = !p.code || p.code.trim() === ''

    const codeSection = p.code ? `<h2>Starter Code</h2><pre><code>${escXml(p.code)}</code></pre>` : ''
    const body = `<h1>${isScenario ? '🕵️' : '🐍'} ${escXml(p.title)}</h1>
<p><strong>${isScenario ? 'Scenario Activity' : 'Python Lab'}</strong>${p.week ? ` — ${escXml(p.week)}` : ''}</p>
<hr/>
${descToHtml(p.description || '')}
${codeSection}`

    if (mode === 'canvas') {
      const href = `${id}/${fileSlug}_settings.xml`
      const metaHref = `${id}/${fileSlug}_activity.html`
      zip.file(metaHref, wikiPageHtml(p.title, body))
      zip.file(href, assignmentXml(id, p.title, 0, p.description || '', ''))
      manifestItems.push({ id, title: p.title, contentType: 'assignment', href: metaHref, metaHref: href, weekNumber })
    } else {
      zip.file(`${isScenario ? 'Scenarios' : 'Labs'}/${fileSlug}.html`, wikiPageHtml(p.title, body))
    }
  }

  // ── 4. Real-world items as wiki pages ─────────────────────────────────
  for (const r of course.realworld_items || []) {
    const weekNumber = parseInt((r.week || '').replace(/\D/g, '')) || 0
    const id = uid()
    const fileSlug = slug(r.title)
    const body = `<h1>${escXml(r.title)}</h1>
<p><strong>Source:</strong> ${r.url ? `<a href="${escXml(r.url)}">${escXml(r.source || r.url)}</a>` : escXml(r.source || '')}</p>
<hr/>
<p>${escXml(r.description || '')}</p>`

    const href = mode === 'canvas'
      ? `wiki_content/realworld_${fileSlug}_${id.slice(0, 6)}.html`
      : `Real-World/${fileSlug}.html`
    zip.file(href, wikiPageHtml(r.title, body))
    if (mode === 'canvas') {
      manifestItems.push({ id, title: r.title, contentType: 'page', href, weekNumber })
    }
  }

  // ── 5. Manifest or README ─────────────────────────────────────────────
  if (mode === 'canvas') {
    zip.file('imsmanifest.xml', buildManifest(course.title, manifestItems, course.weeks || []))
  } else {
    const asgCount = course.assignments?.length || 0
    const wkCount = course.weeks?.length || 0
    zip.file('README.txt',
      `Course: ${course.title}\nNumber: ${course.number || '—'}\nTerm: ${course.term || '—'}\n` +
      `Weeks: ${wkCount}\nAssignments: ${asgCount}\nGenerated: ${new Date().toLocaleString()}\n`)
  }

  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}

// ─── Component ───────────────────────────────────────────────────────────────

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
      const fileSlug = (course.number || course.title).replace(/[^a-z0-9]/gi, '-').toLowerCase()
      a.download = `${fileSlug}.${mode === 'canvas' ? 'imscc' : 'zip'}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      const wks = course.weeks?.length || 0
      const asgs = course.assignments?.length || 0
      toast.success(mode === 'canvas'
        ? `Canvas package ready — ${wks} pages, ${asgs} assignments`
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
        Generate a Canvas-ready <code>.imscc</code> package with fully editable pages and assignments, or a ZIP archive for local use.
      </p>

      <div style={{ background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 10, padding: 22, marginBottom: 14 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>Select Course</p>
        {courses.length === 0
          ? <p style={{ color: 'var(--cf-muted)', fontSize: 13 }}>No courses found.</p>
          : courses.map(c => (
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
          ))
        }
      </div>

      {selected && (() => {
        const c = courses.find(x => x.id === selected)
        if (!c) return null
        return (
          <div style={{ background: 'var(--cf-paper2)', border: '1px solid var(--cf-line)', borderRadius: 8, padding: '12px 16px', marginBottom: 14, fontSize: 12.5, color: 'var(--cf-muted)' }}>
            <strong style={{ color: 'var(--cf-ink)' }}>Will export:</strong>
            <span style={{ marginLeft: 8 }}>{c.weeks?.length || 0} week pages</span>
            <span style={{ marginLeft: 8 }}>· {(c.assignments || []).filter((a: any) => (a.type || '').toLowerCase() !== 'discussion').length} assignments</span>
            <span style={{ marginLeft: 8 }}>· {(c.assignments || []).filter((a: any) => (a.type || '').toLowerCase() === 'discussion').length} discussions</span>
            <span style={{ marginLeft: 8 }}>· {c.python_activities?.length || 0} activities</span>
            <span style={{ marginLeft: 8 }}>· {c.realworld_items?.length || 0} resource pages</span>
          </div>
        )
      })()}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="button is-ink" style={{ flex: 1, padding: '13px', height: 'auto' }}
          onClick={() => handleExport('canvas')} disabled={!selected || !!exporting}>
          {exporting === 'canvas'
            ? <><span className="cf-spin" style={{ marginRight: 6 }} />Building…</>
            : '↓ Export for Canvas (.imscc)'}
        </button>
        <button className="button" style={{ flex: 1, padding: '13px', height: 'auto', background: '#fff', border: '1px solid var(--cf-line)', color: 'var(--cf-ink)' }}
          onClick={() => handleExport('zip')} disabled={!selected || !!exporting}>
          {exporting === 'zip'
            ? <><span className="cf-spin" style={{ marginRight: 6 }} />Building…</>
            : '↓ Download as ZIP'}
        </button>
      </div>

      <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--cf-paper2)', border: '1px solid var(--cf-line)', borderRadius: 8, fontSize: 12, color: 'var(--cf-muted)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--cf-ink)' }}>Canvas import:</strong> Settings → Import Course Content → Common Cartridge 1.x Package → upload the <code>.imscc</code> file.<br/>
        <strong style={{ color: 'var(--cf-ink)' }}>After import:</strong> All week overviews appear as editable <strong>Pages</strong>, assignments appear in <strong>Assignments</strong> with points and submission types, discussions appear in <strong>Discussions</strong>.
      </div>
    </div>
  )
}
