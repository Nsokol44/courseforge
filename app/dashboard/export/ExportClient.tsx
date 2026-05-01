'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import JSZip from 'jszip'

interface Props {
  courses: any[]
}

/**
 * Generates the imsmanifest.xml. 
 * This is the "brain" of the Common Cartridge that tells Canvas how to assemble the ZIP.
 */
function buildIMSCCManifest(course: any, resourceMap: Map<string, any>): string {
  const mid = 'g' + crypto.randomUUID().replace(/-/g, '')
  
  const items = (course.weeks || [])
    .sort((a: any, b: any) => a.week_number - b.week_number)
    .map((w: any) => {
      // items within the week (assignments, labs, etc)
      const weekItems = (w.assignments || []).map((title: string) => {
        const resource = resourceMap.get(title)
        return `<item identifier="item_${crypto.randomUUID().replace(/-/g, '')}" identifierref="${resource?.id || ''}">
          <title>${title}</title>
        </item>`
      }).join('')

      return `<item identifier="week_${w.week_number}">
        <title>Week ${w.week_number}: ${w.topic || '—'}</title>
        ${weekItems}
      </item>`
    }).join('\n')

  const resources = Array.from(resourceMap.values()).map(res => {
    return `<resource identifier="${res.id}" type="${res.ccType}">
      <file href="${res.filePath}"/>
    </resource>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${mid}" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.1.0</schemaversion>
  </metadata>
  <organizations>
    <organization identifier="org_1" structure="rooted-hierarchy">
      <item identifier="LearningModules">
        ${items}
      </item>
    </organization>
  </organizations>
  <resources>
    ${resources}
  </resources>
</manifest>`
}

export default function ExportClient({ courses }: Props) {
  const [selected, setSelected] = useState<string>(courses[0]?.id || '')

  async function handleExport(mode: 'canvas' | 'zip') {
    const course = courses.find(c => c.id === selected)
    if (!course) {
      toast.error('Select a course first')
      return
    }

    const zip = new JSZip()
    const resourceMap = new Map()

    // 1. Compile content and map Database fields to a single 'body' variable
    // We check every likely column name in your Supabase schema (extracted_text, instructions, etc)
    const allContent = [
      ...(course.assignments || []).map((a: any) => ({ 
        ...a, 
        type: a.title?.toLowerCase().includes('discussion') ? 'discussion' : 'assignment',
        body: a.instructions || a.extracted_text || a.description || a.content || ''
      })),
      ...(course.python_activities || []).map((pa: any) => ({ 
        ...pa, 
        type: 'assignment', 
        sub: 'lab',
        body: pa.instructions || pa.extracted_text || pa.description || pa.content || pa.code_instructions || ''
      })),
      ...(course.realworld_items || []).map((rw: any) => ({ 
        ...rw, 
        type: 'page',
        body: rw.content || rw.extracted_text || rw.description || rw.instructions || ''
      }))
    ]

    // 2. Assign unique IDs and categorize for Canvas or Human-readable folders
    allContent.forEach(item => {
      const id = 'res_' + crypto.randomUUID().replace(/-/g, '')
      const slug = (item.title || 'untitled').replace(/[^a-z0-9]/gi, '-').toLowerCase()
      
      let ccType = 'webcontent'
      let folder = mode === 'canvas' ? 'pages' : 'Readings'
      let ext = 'html'

      if (item.type === 'assignment') {
        ccType = 'assignment_xml_adapter'
        folder = mode === 'canvas' ? 'assignments' : (item.sub === 'lab' ? 'Labs' : 'Assignments')
      } else if (item.type === 'discussion') {
        ccType = 'imsdt_xmlv1p1'
        folder = mode === 'canvas' ? 'discussions' : 'Discussions'
        ext = mode === 'canvas' ? 'xml' : 'html'
      }

      resourceMap.set(item.title, { id, ccType, filePath: `${folder}/${slug}.${ext}`, data: item })
    })

    // 3. Set up the Archive Structure
    if (mode === 'canvas') {
      zip.file('imsmanifest.xml', buildIMSCCManifest(course, resourceMap))
    } else {
      zip.file('README.txt', `Course: ${course.title}\nTerm: ${course.term}\nGenerated: ${new Date().toLocaleString()}`)
    }

    // 4. Generate Content Files
    resourceMap.forEach((res) => {
      const { data, filePath } = res
      const contentBody = data.body || '<em>No instructions or text found in database for this item.</em>'
      
      if (mode === 'canvas' && data.type === 'discussion') {
        zip.file(filePath, `<?xml version="1.0" encoding="UTF-8"?>
        <topic xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1">
          <title>${data.title}</title>
          <text texttype="text/html">${contentBody}</text>
        </topic>`)
      } else if (mode === 'canvas' && data.type === 'assignment') {
        zip.file(filePath, `<html><body>${contentBody}</body></html>`)
        // The sidecar file that defines points and makes it a real Canvas Assignment
        zip.file(`${filePath}.xml.canvas`, `<?xml version="1.0" encoding="UTF-8"?>
          <assignment xmlns="http://canvas.instructure.com/xsd/cccv1p0">
            <title>${data.title}</title>
            <points_possible>${data.points || 0}</points_possible>
            <submission_types>online_upload,online_text_entry</submission_types>
          </assignment>`)
      } else {
        // ZIP mode or standard Page
        const htmlDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${data.title}</title><style>body{font-family:-apple-system,sans-serif;line-height:1.6;color:#333;max-width:800px;margin:40px auto;padding:20px;}h1{border-bottom:1px solid #eee;padding-bottom:10px;}.type{color:#999;text-transform:uppercase;font-size:11px;font-weight:bold;margin-bottom:5px;}.pts{color:#666;font-size:13px;margin-bottom:25px;}</style></head><body><div class="type">${data.type}</div><h1>${data.title}</h1><div class="pts">${data.points ? data.points + ' Points' : ''}</div><div class="content">${contentBody}</div></body></html>`
        zip.file(filePath, htmlDoc)
      }
    })

    // 5. Download
    try {
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const fileName = (course.number || course.title).replace(/[^a-z0-9]/gi, '-').toLowerCase()
      a.download = `${fileName}.${mode === 'canvas' ? 'imscc' : 'zip'}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${mode.toUpperCase()}`)
    } catch (err) {
      toast.error('Export failed')
      console.error(err)
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <p className="cf-serif" style={{ fontSize: 24, fontWeight: 300, fontStyle: 'italic', marginBottom: 5 }}>Export Course Content</p>
      <p style={{ fontSize: 13, color: 'var(--cf-muted)', marginBottom: 22 }}>Generate packages for Canvas or local archival.</p>

      <div style={{ background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 10, padding: 22, marginBottom: 14 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>Select Course</p>
        {courses.length === 0 ? (
          <p style={{ color: 'var(--cf-muted)', fontSize: 13 }}>No courses found.</p>
        ) : (
          courses.map(c => (
            <div
              key={c.id}
              onClick={() => setSelected(c.id)}
              style={{ 
                padding: '10px 13px', 
                border: `1px solid ${selected === c.id ? 'rgba(184,134,11,0.4)' : 'var(--cf-line)'}`, 
                borderRadius: 7, 
                cursor: 'pointer', 
                background: selected === c.id ? 'var(--cf-gold-pale)' : '#fff', 
                marginBottom: 7, 
                transition: 'all .15s' 
              }}
            >
              <div style={{ fontWeight: 500, fontSize: 13 }}>{c.title}</div>
              <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)', marginTop: 2 }}>
                {c.term || '—'} · {c.weeks?.length || 0} weeks · {c.total_points || 0} pts
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button 
          className="button is-ink" 
          style={{ flex: 1, padding: '14px', height: 'auto' }}
          onClick={() => handleExport('canvas')} 
          disabled={!selected}
        >
          ↓ Download for Canvas
        </button>
        <button 
          className="button" 
          style={{ 
            flex: 1, 
            padding: '14px', 
            height: 'auto', 
            background: '#fff', 
            border: '1px solid var(--cf-line)',
            color: 'var(--cf-ink)'
          }}
          onClick={() => handleExport('zip')} 
          disabled={!selected}
        >
          ↓ Download as ZIP
        </button>
      </div>
    </div>
  )
}