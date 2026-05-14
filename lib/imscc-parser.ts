// ─────────────────────────────────────────
// IMSCC (Canvas Common Cartridge) Parser v2
// Handles: week grouping, HTML entity decoding,
// Canvas assignment XML format, discussion XML
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

// ── Decode XML/HTML entities ──────────────────────────────────────────────
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
}

function stripHTML(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

// ── Infer assignment type from title ─────────────────────────────────────
function inferType(title: string): ParsedAssignment['type'] {
  const t = title.toLowerCase()
  if (t.includes('lab') || t.includes('notebook') || t.includes('colab') || t.includes('exercise')) return 'Lab'
  if (t.includes('discussion') || t.includes('forum') || t.includes('post')) return 'Discussion'
  if (t.includes('reflection') || t.includes('journal') || t.includes('response')) return 'Reflection'
  if (t.includes('project') || t.includes('proposal') || t.includes('final') || t.includes('dossier') || t.includes('portfolio')) return 'Project'
  if (t.includes('quiz') || t.includes('exam') || t.includes('test') || t.includes('check')) return 'Quiz'
  return 'Assignment'
}

// ── Extract week number from a title string ───────────────────────────────
function extractWeekNum(title: string): number | null {
  // "Week 3", "Wk 3", "Module 3", "Unit 3", "Section 3"
  const m = title.match(/(?:week|wk|module|unit|part|section|chapter)\s*(\d+)/i)
  if (m) return parseInt(m[1])
  // Bare number at start: "3: Topic Name"
  const bare = title.match(/^(\d+)[:\s\-–]/)
  if (bare) return parseInt(bare[1])
  return null
}

// ── Build a resource lookup map from manifest ─────────────────────────────
interface Resource {
  id: string
  type: string    // e.g. "assignment_xmlv1p0", "imsdt_xmlv1p1", "webcontent"
  href: string    // path to the main file inside the zip
}

function parseResources(xml: string): Map<string, Resource> {
  const map = new Map<string, Resource>()
  const resRegex = /<resource\s+identifier="([^"]+)"\s+type="([^"]+)"[^>]*(?:href="([^"]*)")?[^>]*>/g
  let m: RegExpExecArray | null
  while ((m = resRegex.exec(xml)) !== null) {
    const id = m[1]
    const type = m[2]
    let href = m[3] || ''
    // If no inline href, try <file href="..."> inside
    if (!href) {
      const fileHrefRe = new RegExp(`<resource[^>]+identifier="${id}"[^>]*>([\\s\\S]*?)</resource>`)
      const resBlock = fileHrefRe.exec(xml)
      if (resBlock) {
        const fileM = resBlock[1].match(/<file\s+href="([^"]+)"/)
        if (fileM) href = fileM[1]
      }
    }
    map.set(id, { id, type, href })
  }
  return map
}

// ── Parse organization items from manifest ────────────────────────────────
interface OrgItem {
  id: string
  title: string
  resourceRef: string  // identifierref pointing to a resource
  children: OrgItem[]
}

function parseOrgItems(xml: string): OrgItem[] {
  // Extract the <organizations> block
  const orgBlock = xml.match(/<organizations[\s\S]*?<\/organizations>/)
  if (!orgBlock) return []
  const orgXML = orgBlock[0]

  const items: OrgItem[] = []

  // Walk the item tree — only direct children of <item identifier="LearningModules">
  // or the root organization item
  const rootItemMatch = orgXML.match(/<item\s+identifier="LearningModules"[^>]*>([\s\S]*?)<\/item>/) ||
                        orgXML.match(/<item\s+identifier="[^"]*"[^>]*>\s*<title>[^<]*<\/title>([\s\S]*)<\/item>/)

  const toParse = rootItemMatch ? rootItemMatch[1] : orgXML

  // Parse top-level <item> elements (direct children)
  const topItemRe = /<item\s+identifier="([^"]+)"(?:\s+identifierref="([^"]*)")?[^>]*>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null
  while ((match = topItemRe.exec(toParse)) !== null) {
    const id = match[1]
    const resourceRef = match[2] || ''
    const innerXML = match[3]
    const titleM = innerXML.match(/<title>([^<]*)<\/title>/)
    const title = decodeEntities(titleM ? titleM[1].trim() : id)

    // Parse children of this item
    const children: OrgItem[] = []
    const childRe = /<item\s+identifier="([^"]+)"(?:\s+identifierref="([^"]*)")?[^>]*>([\s\S]*?)<\/item>/g
    let childMatch: RegExpExecArray | null
    while ((childMatch = childRe.exec(innerXML)) !== null) {
      const cId = childMatch[1]
      const cRef = childMatch[2] || ''
      const cInner = childMatch[3]
      const cTitleM = cInner.match(/<title>([^<]*)<\/title>/)
      const cTitle = decodeEntities(cTitleM ? cTitleM[1].trim() : cId)
      children.push({ id: cId, title: cTitle, resourceRef: cRef, children: [] })
    }

    items.push({ id, title, resourceRef, children })
  }

  return items
}

// ── Group flat Canvas modules into logical weeks ──────────────────────────
// Canvas often exports one module per page/reading/quiz rather than per week.
// Strategy: group by detected week number; if no week number, cluster by title prefix.
function groupIntoWeeks(items: OrgItem[]): Array<{
  weekNumber: number
  topic: string
  items: OrgItem[]
}> {
  interface Group {
    weekNumber: number
    topic: string
    items: OrgItem[]
  }

  const groups: Group[] = []
  const weekMap = new Map<number, Group>()
  let autoWeek = 1
  let noWeekGroup: Group | null = null

  for (const item of items) {
    if (!item.title) continue

    const detected = extractWeekNum(item.title)

    if (detected !== null) {
      // Has explicit week number
      if (!weekMap.has(detected)) {
        // First item for this week — use it as the topic title
        const group: Group = { weekNumber: detected, topic: item.title, items: [] }
        weekMap.set(detected, group)
        groups.push(group)
      }
      weekMap.get(detected)!.items.push(item)
    } else {
      // No week number — check if this item is a sub-item-like title
      // (reading, quiz, page inside a week) vs a true standalone module
      const isSubItem = item.children.length === 0 &&
        /^(reading|quiz|page|discussion|assignment|lab|module|content|resource)/i.test(item.title)

      if (isSubItem && noWeekGroup) {
        // Attach to the most recent week group
        const lastGroup = groups[groups.length - 1]
        if (lastGroup) lastGroup.items.push(item)
      } else {
        // Standalone module with no week number — give it its own sequential week
        // unless there's already a group in progress
        if (noWeekGroup && groups.length > 0) {
          groups[groups.length - 1].items.push(item)
        } else {
          const group: Group = { weekNumber: autoWeek++, topic: item.title, items: [item] }
          groups.push(group)
          noWeekGroup = group
        }
      }
    }
  }

  // Re-number if all modules had no week numbers (autoWeek sequence)
  if (weekMap.size === 0) {
    groups.forEach((g, i) => { g.weekNumber = i + 1 })
  }

  return groups.sort((a, b) => a.weekNumber - b.weekNumber)
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
  const titleMatch = manifestXML.match(/<lomimscc:string[^>]*>([^<]+)<\/lomimscc:string>/) ||
                     manifestXML.match(/<title>([^<]+)<\/title>/)
  const courseTitle = decodeEntities(titleMatch ? titleMatch[1].trim() : 'Imported Course')

  // 3. Build resource map (id → {type, href})
  const resources = parseResources(manifestXML)

  // 4. Parse organization items
  const orgItems = parseOrgItems(manifestXML)
  if (orgItems.length === 0) {
    warnings.push('Could not parse organization structure from manifest')
  }

  // 5. Also scan ALL assignment XML files in the zip directly
  //    Canvas puts assignments in files ending with _assignment_settings.xml
  //    or typed as assignment_xmlv1p0 in resources
  const allAssignments: ParsedAssignment[] = []
  const seenTitles = new Set<string>()

  // 5a. Find all assignment resources from the resource map
  const assignmentResources: Resource[] = []
  const discussionResources: Resource[] = []
  const quizResources: Resource[] = []

  resources.forEach(res => {
    const t = res.type.toLowerCase()
    if (t.includes('assignment')) assignmentResources.push(res)
    else if (t.includes('discussion') || t.includes('imsdt')) discussionResources.push(res)
    else if (t.includes('question') || t.includes('quiz') || t.includes('imsqti')) quizResources.push(res)
  })

  // 5b. Also scan zip for any *_assignment_settings.xml files not in resources
  const zipFiles = Object.keys(zip.files)
  const extraAssignmentFiles = zipFiles.filter(f =>
    (f.endsWith('_assignment_settings.xml') || f.includes('assignment') || f.endsWith('assignment.xml'))
    && !f.startsWith('__MACOSX')
  )

  async function extractAssignment(filePath: string, weekLabel: string): Promise<ParsedAssignment | null> {
    const file = zip.file(filePath)
    if (!file) return null
    const xml = await file.async('string')

    const titleM = xml.match(/<title>([^<]+)<\/title>/) || xml.match(/<name>([^<]+)<\/name>/)
    if (!titleM) return null
    const title = decodeEntities(titleM[1].trim())
    if (seenTitles.has(title) || title.length < 2) return null
    seenTitles.add(title)

    const pointsM = xml.match(/points_possible[">]*\s*([0-9.]+)/) ||
                    xml.match(/<points_possible>([0-9.]+)/) ||
                    xml.match(/max_score[">]*\s*([0-9.]+)/)
    const points = pointsM ? parseFloat(pointsM[1]) : 0

    const dueDateM = xml.match(/<due_at>([^<]+)<\/due_at>/) || xml.match(/due_at[">]*\s*([0-9T:\-Z]+)/)
    const due_date = dueDateM ? dueDateM[1].trim().split('T')[0] : ''

    // Try to get description from body/description element
    const descM = xml.match(/<body>([\s\S]*?)<\/body>/) ||
                  xml.match(/<description>([\s\S]*?)<\/description>/)
    const description = descM ? stripHTML(descM[1]).slice(0, 600) : `${title} — imported from Canvas`

    return {
      title,
      type: inferType(title),
      points,
      week: weekLabel,
      due_date,
      description: description || `${title} — imported from Canvas`,
    }
  }

  // Process assignment resources from resource map
  for (const res of assignmentResources) {
    if (res.href) {
      const asg = await extractAssignment(res.href, 'Week 1')
      if (asg) allAssignments.push(asg)
    }
  }

  // Process extra assignment files found by scanning
  for (const filePath of extraAssignmentFiles) {
    // Skip if already processed via resource map
    const alreadyDone = assignmentResources.some(r => r.href === filePath)
    if (!alreadyDone) {
      const asg = await extractAssignment(filePath, 'Week 1')
      if (asg) allAssignments.push(asg)
    }
  }

  // Process discussions
  for (const res of discussionResources) {
    if (res.href) {
      const file = zip.file(res.href)
      if (!file) continue
      const xml = await file.async('string')
      const titleM = xml.match(/<title>([^<]+)<\/title>/)
      if (!titleM) continue
      const title = decodeEntities(titleM[1].trim())
      if (seenTitles.has(title) || title.length < 2) continue
      seenTitles.add(title)
      const textM = xml.match(/<text[^>]*>([\s\S]*?)<\/text>/)
      const description = textM ? stripHTML(textM[1]).slice(0, 600) : `${title} — imported from Canvas`
      allAssignments.push({
        title, type: 'Discussion', points: 0, week: 'Week 1', due_date: '', description,
      })
    }
  }

  // 6. Group org items into weeks
  const weekGroups = groupIntoWeeks(orgItems)

  // 7. Build week objects + assign assignments to weeks by matching titles
  const weeks: ParsedWeek[] = []

  // Map assignment titles to week numbers by looking for them in org item children
  const assignmentWeekMap = new Map<string, string>()
  for (const group of weekGroups) {
    const wLabel = `Week ${group.weekNumber}`
    for (const item of group.items) {
      // Check direct item title
      const cleanTitle = decodeEntities(item.title)
      if (allAssignments.find(a => a.title === cleanTitle)) {
        assignmentWeekMap.set(cleanTitle, wLabel)
      }
      // Check children
      for (const child of item.children) {
        const childTitle = decodeEntities(child.title)
        if (allAssignments.find(a => a.title === childTitle)) {
          assignmentWeekMap.set(childTitle, wLabel)
        }
        // Also look up by resourceRef
        if (child.resourceRef) {
          const res = resources.get(child.resourceRef)
          if (res && (res.type.includes('assignment') || res.type.includes('discussion'))) {
            // Try to find matching assignment by href scan
            if (res.href) {
              const file = zip.file(res.href)
              if (file) {
                const xml = await file.async('string')
                const titleM = xml.match(/<title>([^<]+)<\/title>/)
                if (titleM) {
                  const t = decodeEntities(titleM[1].trim())
                  assignmentWeekMap.set(t, wLabel)
                  if (!seenTitles.has(t)) {
                    seenTitles.add(t)
                    const pointsM = xml.match(/points_possible[">]*\s*([0-9.]+)/) || xml.match(/<points_possible>([0-9.]+)/)
                    const descM = xml.match(/<body>([\s\S]*?)<\/body>/) || xml.match(/<description>([\s\S]*?)<\/description>/)
                    const description = descM ? stripHTML(descM[1]).slice(0, 600) : `${t} — imported from Canvas`
                    allAssignments.push({
                      title: t,
                      type: inferType(t),
                      points: pointsM ? parseFloat(pointsM[1]) : 0,
                      week: wLabel,
                      due_date: '',
                      description,
                    })
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Apply week labels to assignments
  for (const asg of allAssignments) {
    if (assignmentWeekMap.has(asg.title)) {
      asg.week = assignmentWeekMap.get(asg.title)!
    }
  }

  // Build week rows
  for (const group of weekGroups) {
    const wLabel = `Week ${group.weekNumber}`
    const weekAssignmentTitles = allAssignments
      .filter(a => a.week === wLabel)
      .map(a => a.title)

    // Try to get week description from any HTML content in the group
    let weekDescription = ''
    const weekReadings: string[] = []

    for (const item of group.items.slice(0, 4)) {
      if (!item.resourceRef) continue
      const res = resources.get(item.resourceRef)
      if (!res || !res.href) continue
      if (!res.type.includes('webcontent') && !res.href.endsWith('.html')) continue
      const file = zip.file(res.href)
      if (!file) continue
      const html = await file.async('string')
      const text = stripHTML(html)
      if (text.length > 30 && !weekDescription) weekDescription = text.slice(0, 200)
      const urls = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)]
        .map(m => m[1])
        .filter(u => !u.includes('canvas') && !u.includes('instructure'))
      weekReadings.push(...urls.slice(0, 3))
    }

    weeks.push({
      week_number: group.weekNumber,
      topic: decodeEntities(group.topic),
      description: weekDescription || `${wLabel} content imported from Canvas.`,
      readings: weekReadings,
      assignments_due: weekAssignmentTitles,
      raw_content: weekDescription,
    })
  }

  weeks.sort((a, b) => a.week_number - b.week_number)

  if (allAssignments.length === 0) {
    warnings.push('No assignments found in this export. Canvas may not have included assignment XML files. You can add them manually in the Assignments tab.')
  }

  return {
    courseName: courseTitle,
    weeks,
    assignments: allAssignments,
    rawManifest: manifestXML.slice(0, 2000),
    warnings,
  }
}
