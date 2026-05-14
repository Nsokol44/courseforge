// ─────────────────────────────────────────
// IMSCC (Canvas Common Cartridge) Parser v3
// Robust multi-strategy assignment extraction
// ─────────────────────────────────────────

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

// ── Decode XML entities ───────────────────────────────────────────────────
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
  if (t.includes('discussion') || t.includes('forum') || t.includes('post')) return 'Discussion'
  if (t.includes('reflection') || t.includes('journal') || t.includes('response')) return 'Reflection'
  if (t.includes('project') || t.includes('proposal') || t.includes('final') || t.includes('dossier') || t.includes('portfolio')) return 'Project'
  if (t.includes('quiz') || t.includes('exam') || t.includes('test') || t.includes('check')) return 'Quiz'
  return 'Assignment'
}

function extractWeekNum(title: string): number | null {
  const m = title.match(/(?:week|wk|module|unit|part|section|chapter)\s*(\d+)/i)
  if (m) return parseInt(m[1])
  const bare = title.match(/^(\d+)[:\s\-–]/)
  if (bare && parseInt(bare[1]) <= 52) return parseInt(bare[1])
  return null
}

// ── Extract all text content between two XML tags ────────────────────────
function getTagContent(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = xml.match(re)
  return m ? m[1].trim() : null
}

// ── Get a single attribute value from a tag ─────────────────────────────
function getAttr(tag: string, attr: string): string {
  const re = new RegExp(`${attr}="([^"]*)"`)
  const m = tag.match(re)
  return m ? m[1] : ''
}

// ── Parse manifest: extract flat list of all <resource> entries ──────────
interface ManifestResource {
  id: string
  type: string
  href: string  // primary file path inside the zip
}

function parseManifestResources(xml: string): Map<string, ManifestResource> {
  const map = new Map<string, ManifestResource>()

  // Match each <resource ...> block
  const re = /<resource([^>]*)>([\s\S]*?)<\/resource>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1]
    const body = m[2]

    const id = getAttr(attrs, 'identifier')
    if (!id) continue
    const type = getAttr(attrs, 'type').toLowerCase()

    // href may be on the resource tag itself or in a child <file href="...">
    let href = getAttr(attrs, 'href')
    if (!href) {
      const fileM = body.match(/<file\s+href="([^"]+)"/)
      if (fileM) href = fileM[1]
    }

    map.set(id, { id, type, href })
  }

  return map
}

// ── Parse manifest: extract flat list of ALL <item> entries with resourceRef ──
interface ManifestItem {
  id: string
  title: string
  resourceRef: string  // identifierref
  parentId: string
  depth: number
}

function parseManifestItems(xml: string): ManifestItem[] {
  const items: ManifestItem[] = []

  // Pull out the organizations section
  const orgM = xml.match(/<organizations[\s\S]*?>([\s\S]*?)<\/organizations>/)
  if (!orgM) return items
  const orgXML = orgM[1]

  // Walk every <item ...> in document order (depth tracking via stack)
  const re = /<(\/?)item([^>]*)>/g
  let m: RegExpExecArray | null
  const stack: string[] = ['ROOT']
  let currentId = ''

  // We need title too — scan all item blocks differently
  // Use a simpler approach: find every item with identifier, get its title
  const itemRe = /<item\s([^>]*)>([\s\S]*?)(?=<item\s|<\/item>)/g
  const seen = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = itemRe.exec(orgXML)) !== null) {
    const attrs = match[1]
    const body = match[2]
    const id = getAttr(attrs, 'identifier')
    if (!id || seen.has(id)) continue
    seen.add(id)
    const ref = getAttr(attrs, 'identifierref')
    const titleM = body.match(/<title>([^<]*)<\/title>/)
    const title = decodeEntities(titleM ? titleM[1].trim() : id)
    items.push({ id, title, resourceRef: ref, parentId: '', depth: 0 })
  }

  return items
}

// ── Main parser ───────────────────────────────────────────────────────────
export async function parseIMSCC(buffer: ArrayBuffer): Promise<IMSCCParseResult> {
  const JSZipGlobal = (typeof window !== 'undefined' && (window as any).JSZip)
  if (!JSZipGlobal) throw new Error('JSZip not loaded — check layout.tsx CDN script')

  const zip = await JSZipGlobal.loadAsync(buffer)
  const warnings: string[] = []

  // 1. Read manifest
  const manifestFile = zip.file('imsmanifest.xml')
  if (!manifestFile) throw new Error('No imsmanifest.xml — not a valid .imscc file')
  const manifestXML = await manifestFile.async('string')

  // 2. Course title
  const titleM1 = manifestXML.match(/<lomimscc:string[^>]*>([^<]+)<\/lomimscc:string>/)
  const titleM2 = manifestXML.match(/<title>([^<]+)<\/title>/)
  const courseTitle = decodeEntities((titleM1 || titleM2)?.[1]?.trim() || 'Imported Course')

  // 3. Resources map
  const resources = parseManifestResources(manifestXML)

  // 4. All org items (flat list)
  const orgItems = parseManifestItems(manifestXML)

  // ── STRATEGY A: scan every file in zip for assignment/discussion content ──
  // This is the most reliable approach — don't trust the manifest structure
  const allAssignments: ParsedAssignment[] = []
  const seenTitles = new Set<string>()
  const zipFiles = Object.keys(zip.files).filter(f => !f.startsWith('__MACOSX') && !zip.files[f].dir)

  async function tryExtractAssignment(filePath: string, defaultWeek: string): Promise<ParsedAssignment | null> {
    const file = zip.file(filePath)
    if (!file) return null
    let xml: string
    try { xml = await file.async('string') } catch { return null }

    // Must have a title
    const titleM = xml.match(/<title>([^<]+)<\/title>/) || xml.match(/<name>([^<]+)<\/name>/)
    if (!titleM) return null
    const title = decodeEntities(titleM[1].trim())
    if (!title || title.length < 2 || seenTitles.has(title)) return null

    // Skip if it's clearly not an assignment (e.g. course overview pages)
    const isAssignmentContent = xml.includes('points_possible') ||
      xml.includes('submission_type') || xml.includes('assignment_group') ||
      filePath.toLowerCase().includes('assignment') ||
      filePath.toLowerCase().includes('discussion_topic') ||
      xml.includes('<questestinterop') ||  // quiz
      inferType(title) !== 'Assignment'  // title implies assignment type

    if (!isAssignmentContent) return null
    seenTitles.add(title)

    const pointsM = xml.match(/<points_possible>([0-9.]+)/) ||
                    xml.match(/points_possible[^>]*>([0-9.]+)/) ||
                    xml.match(/<max_score[^>]*>([0-9.]+)/) ||
                    xml.match(/score_value[^>]*>([0-9.]+)/)
    const points = pointsM ? parseFloat(pointsM[1]) : 0

    const dueDateM = xml.match(/<due_at>([^<]+)<\/due_at>/)
    const due_date = dueDateM ? dueDateM[1].trim().split('T')[0] : ''

    const descM = xml.match(/<body>([\s\S]*?)<\/body>/) ||
                  xml.match(/<description>([\s\S]*?)<\/description>/) ||
                  xml.match(/<text[^>]*>([\s\S]*?)<\/text>/)
    const description = descM ? stripHTML(descM[1]).slice(0, 800) : `${title} — imported from Canvas. Add a full description.`

    return { title, type: inferType(title), points, week: defaultWeek, due_date, description }
  }

  // STRATEGY A1: process resources typed as assignment/discussion/quiz
  for (const [, res] of resources) {
    const t = res.type
    if (t.includes('assignment') || t.includes('discussion') || t.includes('imsdt') ||
        t.includes('imsqti') || t.includes('quiz')) {
      if (res.href) {
        const asg = await tryExtractAssignment(res.href, 'Week 1')
        if (asg) allAssignments.push(asg)
      }
    }
  }

  // STRATEGY A2: brute-force scan all files whose name suggests assignment content
  for (const filePath of zipFiles) {
    if (allAssignments.some(a => seenTitles.has(a.title))) {
      // Already found some via resources — only scan files we haven't seen
    }
    const lower = filePath.toLowerCase()
    const looksLikeAssignment =
      lower.includes('assignment') ||
      lower.includes('discussion_topic') ||
      lower.includes('discussion') ||
      (lower.endsWith('.xml') && !lower.includes('manifest') && !lower.includes('syllabus'))

    if (looksLikeAssignment && (filePath.endsWith('.xml') || filePath.endsWith('.html'))) {
      const asg = await tryExtractAssignment(filePath, 'Week 1')
      if (asg) allAssignments.push(asg)
    }
  }

  // STRATEGY A3: extract from org items whose title looks like an assignment
  // (catches cases where assignments are listed in the org but have no separate XML file)
  for (const item of orgItems) {
    const title = item.title
    if (!title || seenTitles.has(title) || title.length < 3) continue
    const type = inferType(title)
    // Only add if title strongly suggests it's an assignment (not a page/reading)
    if (type !== 'Assignment') {
      // Discussion, Lab, Quiz, etc — add as placeholder assignment
      seenTitles.add(title)
      allAssignments.push({
        title, type, points: 0, week: 'Week 1', due_date: '',
        description: `${title} — imported from Canvas. Add a full description.`,
      })
    }
  }

  // ── Group org items into weeks ────────────────────────────────────────
  // Cluster items by detected week number, then assign assignments to weeks
  const weekMap = new Map<number, { topic: string; items: ManifestItem[] }>()
  let autoNum = 1

  for (const item of orgItems) {
    const wn = extractWeekNum(item.title)
    if (wn !== null) {
      if (!weekMap.has(wn)) weekMap.set(wn, { topic: item.title, items: [] })
      weekMap.get(wn)!.items.push(item)
    } else {
      // attach to last group or create new
      const keys = [...weekMap.keys()].sort((a, b) => a - b)
      const lastKey = keys[keys.length - 1]
      if (lastKey !== undefined) {
        weekMap.get(lastKey)!.items.push(item)
      } else {
        weekMap.set(autoNum, { topic: item.title, items: [item] })
        autoNum++
      }
    }
  }

  // If no week structure detected, put everything in sequential weeks
  if (weekMap.size === 0) {
    orgItems.forEach((item, i) => {
      weekMap.set(i + 1, { topic: item.title, items: [item] })
    })
  }

  // Re-number contiguously (1, 2, 3...) if there are gaps
  const sortedWeekNums = [...weekMap.keys()].sort((a, b) => a - b)

  // ── Map assignments to their week by matching org item titles ─────────
  // Build a map: assignment title → week number
  const asgWeekMap = new Map<string, number>()
  for (let i = 0; i < sortedWeekNums.length; i++) {
    const wn = sortedWeekNums[i]
    const group = weekMap.get(wn)!
    const weekNum = i + 1  // renumbered sequentially

    for (const item of group.items) {
      const t = decodeEntities(item.title)
      const asg = allAssignments.find(a => a.title === t || a.title.toLowerCase() === t.toLowerCase())
      if (asg) asgWeekMap.set(asg.title, weekNum)

      // Also try via resourceRef
      if (item.resourceRef) {
        const res = resources.get(item.resourceRef)
        if (res?.href) {
          // Find assignment whose source file matches this resource href
          // We can't easily reverse-look that up, so just match by week item title
          for (const asg2 of allAssignments) {
            if (asg2.title.toLowerCase().includes(t.toLowerCase().slice(0, 15)) ||
                t.toLowerCase().includes(asg2.title.toLowerCase().slice(0, 15))) {
              if (!asgWeekMap.has(asg2.title)) asgWeekMap.set(asg2.title, weekNum)
            }
          }
        }
      }
    }
  }

  // Apply week labels to assignments
  for (const asg of allAssignments) {
    const weekNum = asgWeekMap.get(asg.title)
    if (weekNum) asg.week = `Week ${weekNum}`
  }

  // ── Build week rows ───────────────────────────────────────────────────
  const weeks: ParsedWeek[] = []
  for (let i = 0; i < sortedWeekNums.length; i++) {
    const wn = sortedWeekNums[i]
    const group = weekMap.get(wn)!
    const weekNum = i + 1
    const wLabel = `Week ${weekNum}`

    const weekAssignmentTitles = allAssignments
      .filter(a => a.week === wLabel)
      .map(a => a.title)

    const weekReadings: string[] = []
    let weekDescription = ''

    // Try to get HTML content from wiki pages in this week
    for (const item of group.items.slice(0, 3)) {
      if (!item.resourceRef) continue
      const res = resources.get(item.resourceRef)
      if (!res?.href || !res.href.endsWith('.html')) continue
      const file = zip.file(res.href)
      if (!file) continue
      try {
        const html = await file.async('string')
        const text = stripHTML(html)
        if (text.length > 30 && !weekDescription) weekDescription = text.slice(0, 200)
        const urls = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)]
          .map(m => m[1]).filter(u => !u.includes('canvas') && !u.includes('instructure'))
        weekReadings.push(...urls.slice(0, 3))
      } catch {}
    }

    weeks.push({
      week_number: weekNum,
      topic: decodeEntities(group.topic),
      description: weekDescription || `${wLabel} content imported from Canvas.`,
      readings: weekReadings,
      assignments_due: weekAssignmentTitles,
      raw_content: weekDescription,
    })
  }

  if (allAssignments.length === 0) {
    warnings.push('No assignments found. Your Canvas export may not include assignment files. You can add assignments manually or use Deep Enrich.')
  }

  return {
    courseName: courseTitle,
    weeks,
    assignments: allAssignments,
    rawManifest: manifestXML.slice(0, 2000),
    warnings,
  }
}
