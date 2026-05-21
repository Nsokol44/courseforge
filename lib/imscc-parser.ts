// ─────────────────────────────────────────────────────────────
// IMSCC Parser v4 — built from real Canvas export inspection
//
// Canvas export structure (confirmed from real .imscc):
//
// ASSIGNMENTS: g{hash}/assignment_settings.xml
//   → <title>, <points_possible>, <due_at>, <submission_types>
//   → description in sibling g{hash}/{slug}.html file
//
// DISCUSSIONS: g{hash}.xml at root level, root element <topic>
//   → <title>, <text> (HTML-encoded body)
//   → topicMeta files (g{hash}.xml with <topicMeta>) are DUPLICATES — skip
//
// PAGES/LECTURES: wiki_content/*.html
//   → Full HTML with readings list, video links, Colab links
//
// MODULE STRUCTURE: course_settings/module_meta.xml
//   → <module> blocks with <title> and <items> listing content_type
//   → content_type values: Attachment, WikiPage, DiscussionTopic, Assignment
//
// ─────────────────────────────────────────────────────────────

export interface ParsedWeek {
  week_number: number
  topic: string
  description: string
  readings: string[]
  assignments_due: string[]
  raw_content: string
}

export interface ParsedAssignment {
  title: string
  type: 'Lab' | 'Discussion' | 'Reflection' | 'Project' | 'Quiz' | 'Assignment'
  points: number
  week: string
  due_date: string
  description: string
}

export interface IMSCCParseResult {
  courseName: string
  weeks: ParsedWeek[]
  assignments: ParsedAssignment[]
  rawManifest: string
  warnings: string[]
}

function decodeEntities(s: string): string {
  if (!s) return ''
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
}

function stripHTML(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function inferType(title: string): ParsedAssignment['type'] {
  const t = title.toLowerCase()
  if (t.includes('lab') || t.includes('notebook') || t.includes('colab') || t.includes('exercise')) return 'Lab'
  if (t.includes('discussion') || t.includes('forum') || t.includes('what is') || t.includes('spatial data all')) return 'Discussion'
  if (t.includes('reflection') || t.includes('journal')) return 'Reflection'
  if (t.includes('project') || t.includes('proposal') || t.includes('final') || t.includes('dossier') || t.includes('portfolio')) return 'Project'
  if (t.includes('quiz') || t.includes('exam') || t.includes('test')) return 'Quiz'
  return 'Assignment'
}

function tag(xml: string, tagName: string): string {
  const m = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))
  return m ? m[1].trim() : ''
}

function attr(str: string, name: string): string {
  const m = str.match(new RegExp(`${name}="([^"]*)"`, 'i'))
  return m ? m[1] : ''
}

export async function parseIMSCC(buffer: ArrayBuffer): Promise<IMSCCParseResult> {
  const JSZipGlobal = (typeof window !== 'undefined' && (window as any).JSZip)
  if (!JSZipGlobal) throw new Error('JSZip not loaded')

  const zip = await JSZipGlobal.loadAsync(buffer)
  const warnings: string[] = []
  const allFiles: string[] = Object.keys(zip.files).filter(f => !zip.files[f].dir && !f.startsWith('__MACOSX'))

  async function read(path: string): Promise<string> {
    const f = zip.file(path)
    if (!f) return ''
    try { return await f.async('string') } catch { return '' }
  }

  // ── 1. Course title from manifest ────────────────────────────────────
  const manifest = await read('imsmanifest.xml')
  if (!manifest) throw new Error('No imsmanifest.xml found')

  const titleM = manifest.match(/<lomimscc:string[^>]*>([\s\S]*?)<\/lomimscc:string>/)
  const courseTitle = decodeEntities(titleM ? titleM[1].trim() : 'Imported Course')

  // ── 2. Parse module_meta.xml — the real week/module structure ─────────
  const moduleMeta = await read('course_settings/module_meta.xml')
  
  interface Module {
    id: string
    title: string
    position: number
    items: Array<{ id: string; title: string; contentType: string; identifierRef: string; position: number }>
  }

  const modules: Module[] = []

  if (moduleMeta) {
    const moduleBlocks = moduleMeta.match(/<module\s[^>]*>([\s\S]*?)<\/module>/g) || []
    for (const block of moduleBlocks) {
      const id = attr(block, 'identifier')
      const title = decodeEntities(tag(block, 'title'))
      const posStr = tag(block, 'position')
      const position = posStr ? parseInt(posStr) : modules.length + 1

      const items: Module['items'] = []
      const itemBlocks = block.match(/<item\s[^>]*>([\s\S]*?)<\/item>/g) || []
      for (const ib of itemBlocks) {
        const iid = attr(ib, 'identifier')
        const iTitle = decodeEntities(tag(ib, 'title'))
        const contentType = tag(ib, 'content_type')
        const identifierRef = tag(ib, 'identifierref')
        const iPos = parseInt(tag(ib, 'position') || '0')
        if (iid && iTitle) items.push({ id: iid, title: iTitle, contentType, identifierRef, position: iPos })
      }

      if (id && title) modules.push({ id, title, position, items })
    }
    modules.sort((a, b) => a.position - b.position)
  }

  // ── 3. Build resource map from manifest ──────────────────────────────
  const resourceMap = new Map<string, { type: string; href: string }>()
  const resRegex = /<resource\s([^>]*)>([\s\S]*?)<\/resource>/g
  let rm: RegExpExecArray | null
  while ((rm = resRegex.exec(manifest)) !== null) {
    const rid = attr(rm[1], 'identifier')
    const rtype = attr(rm[1], 'type').toLowerCase()
    let rhref = attr(rm[1], 'href')
    if (!rhref) {
      const fm = rm[2].match(/<file\s+href="([^"]+)"/)
      if (fm) rhref = fm[1]
    }
    if (rid) resourceMap.set(rid, { type: rtype, href: rhref })
  }

  // ── 4. Extract ALL assignments from g{hash}/assignment_settings.xml ───
  const assignments: ParsedAssignment[] = []
  const seenTitles = new Set<string>()

  const assignmentFiles = allFiles.filter(f => f.endsWith('/assignment_settings.xml'))
  
  for (const filePath of assignmentFiles) {
    const xml = await read(filePath)
    if (!xml) continue

    const title = decodeEntities(tag(xml, 'title'))
    if (!title || seenTitles.has(title)) continue
    seenTitles.add(title)

    const pointsStr = tag(xml, 'points_possible')
    const points = pointsStr ? parseFloat(pointsStr) : 0
    const dueAt = tag(xml, 'due_at')
    const due_date = dueAt ? dueAt.split('T')[0] : ''

    // Get description from the sibling HTML file in same folder
    const folder = filePath.replace('/assignment_settings.xml', '')
    const siblingHTML = allFiles.find(f => f.startsWith(folder + '/') && f.endsWith('.html'))
    let description = `${title} — imported from Canvas.`
    if (siblingHTML) {
      const html = await read(siblingHTML)
      if (html) {
        const bodyM = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
        const bodyText = stripHTML(bodyM ? bodyM[1] : html).slice(0, 800)
        if (bodyText.length > 20) description = bodyText
      }
    }

    assignments.push({ title, type: inferType(title), points, week: 'Week 1', due_date, description })
  }

  // ── 5. Extract discussions from root-level g{hash}.xml (<topic> files) ─
  const rootXMLs = allFiles.filter(f => f.endsWith('.xml') && !f.includes('/') && f !== 'imsmanifest.xml')

  // Patterns that indicate an instructor ANNOUNCEMENT — not a student assignment
  const announcementPatterns = [
    /\bis (up|now|available|live)\b/i,
    /\binformation\b/i,
    /congratulations/i,
    /^rest of the/i,
    /notebook is up/i,
    /apolog/i,
    /^update[:\s]/i,
    /\breminder\b/i,
    /tasks? for the (rest|remainder)/i,
  ]

  for (const filePath of rootXMLs) {
    const xml = await read(filePath)
    if (!xml || (!xml.includes('<topic ') && !xml.includes('<topic>'))) continue
    // Skip topicMeta files — they're duplicates
    if (xml.trim().includes('<topicMeta')) continue

    const title = decodeEntities(tag(xml, 'title'))
    if (!title || seenTitles.has(title)) continue

    // Skip instructor announcements — they aren't student assignments
    if (announcementPatterns.some(p => p.test(title))) {
      seenTitles.add(title)
      continue
    }

    seenTitles.add(title)
    const textContent = tag(xml, 'text')
    const description = textContent
      ? stripHTML(decodeEntities(textContent)).slice(0, 800)
      : `${title} — Discussion imported from Canvas.`

    assignments.push({ title, type: inferType(title), points: 0, week: 'Week 1', due_date: '', description })
  }

  // ── 6. Map assignments to modules/weeks ───────────────────────────────
  // Build identifier → module position lookup
  const identifierToModule = new Map<string, { moduleIdx: number; moduleTitle: string }>()

  for (let mi = 0; mi < modules.length; mi++) {
    const mod = modules[mi]
    for (const item of mod.items) {
      identifierToModule.set(item.identifierRef, { moduleIdx: mi, moduleTitle: mod.title })
      identifierToModule.set(item.id, { moduleIdx: mi, moduleTitle: mod.title })
    }
  }

  // Now for each assignment, find which module it belongs to
  // Match by: resource identifier in manifest → module item identifierRef
  for (const asg of assignments) {
    // Find resource ID by title match or file path
    let found = false
    
    // Strategy 1: find module item whose title matches assignment title
    for (let mi = 0; mi < modules.length; mi++) {
      const mod = modules[mi]
      for (const item of mod.items) {
        if (item.title.toLowerCase() === asg.title.toLowerCase() ||
            item.title.toLowerCase().includes(asg.title.toLowerCase().slice(0, 20)) ||
            asg.title.toLowerCase().includes(item.title.toLowerCase().slice(0, 20))) {
          asg.week = `Week ${mi + 1}`
          found = true
          break
        }
      }
      if (found) break
    }
  }

  // ── 7. Build weeks from modules ───────────────────────────────────────
  const weeks: ParsedWeek[] = []

  for (let mi = 0; mi < modules.length; mi++) {
    const mod = modules[mi]
    const weekNum = mi + 1
    const wLabel = `Week ${weekNum}`

    const weekAssignmentTitles = assignments
      .filter(a => a.week === wLabel)
      .map(a => a.title)

    // Extract readings and links from wiki_content pages in this module
    const readings: string[] = []
    let description = ''

    for (const item of mod.items) {
      const res = resourceMap.get(item.identifierRef)
      if (!res?.href) continue

      if (res.href.startsWith('wiki_content/') && res.href.endsWith('.html')) {
        const html = await read(res.href)
        if (!html) continue

        // Extract PDF reading names
        const pdfMatches = [...html.matchAll(/([A-Za-z0-9_\-\s]+\.pdf)/g)]
        for (const m of pdfMatches) {
          const name = m[1].trim().replace(/_/g, ' ').replace(/\.pdf$/i, '')
          if (name.length > 3 && !readings.includes(name)) readings.push(name)
        }

        // Extract YouTube/Colab links as readings
        const linkMatches = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)]
        for (const m of linkMatches) {
          const url = m[1]
          if (!url.includes('canvas') && !url.includes('instructure') && !readings.includes(url)) {
            readings.push(url)
          }
        }

        // Description from page text
        if (!description) {
          const bodyM = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
          const text = stripHTML(bodyM ? bodyM[1] : html)
          if (text.length > 20) description = text.slice(0, 300)
        }
      }
    }

    weeks.push({
      week_number: weekNum,
      topic: mod.title,
      description: description || `${wLabel}: ${mod.title} — imported from Canvas.`,
      readings: readings.slice(0, 8),
      assignments_due: weekAssignmentTitles,
      raw_content: description,
    })
  }

  // If no modules found, fall back to a single week with everything
  if (weeks.length === 0) {
    warnings.push('No module structure found in module_meta.xml. Created a single week with all content.')
    weeks.push({
      week_number: 1, topic: courseTitle,
      description: 'All course content imported from Canvas.',
      readings: [], assignments_due: assignments.map(a => a.title), raw_content: '',
    })
    for (const a of assignments) a.week = 'Week 1'
  }

  if (assignments.length === 0) {
    warnings.push('No assignments found. Add them manually or use Deep Enrich.')
  }

  console.log(`[IMSCC v4] ${courseTitle}: ${modules.length} modules, ${assignments.length} assignments`)
  console.log('[IMSCC v4] Assignments:', assignments.map(a => `${a.title} (${a.week}, ${a.points}pts)`))

  return { courseName: courseTitle, weeks, assignments, rawManifest: manifest.slice(0, 2000), warnings }
}
