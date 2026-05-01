// ─────────────────────────────────────────
// IMSCC (Canvas Common Cartridge) Parser
// Runs entirely client-side using JSZip-compatible ArrayBuffer reading
// Extracts: modules/weeks, assignments, wiki pages, discussions
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
}

// Strip HTML tags and decode common entities
function stripHTML(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// Parse the imsmanifest.xml to get item structure
function parseManifest(xml: string): { title: string; items: { id: string; title: string; children: { id: string; title: string }[] }[] } {
  const titleMatch = xml.match(/<lomimscc:string[^>]*>([^<]+)<\/lomimscc:string>/)
  const courseTitle = titleMatch ? titleMatch[1].trim() : 'Imported Course'

  const items: { id: string; title: string; children: { id: string; title: string }[] }[] = []

  // Match top-level items under LearningModules
  const moduleRegex = /<item identifier="([^"]+)"[^>]*>\s*<title>([^<]+)<\/title>([\s\S]*?)<\/item>/g
  let moduleMatch
  while ((moduleMatch = moduleRegex.exec(xml)) !== null) {
    const id = moduleMatch[1]
    const title = moduleMatch[2].trim()
    const innerXML = moduleMatch[3]

    const children: { id: string; title: string }[] = []
    const childRegex = /<item identifier="([^"]+)"[^>]*>\s*<title>([^<]+)<\/title>/g
    let childMatch
    while ((childMatch = childRegex.exec(innerXML)) !== null) {
      children.push({ id: childMatch[1], title: childMatch[2].trim() })
    }

    items.push({ id, title, children })
  }

  return { title: courseTitle, items }
}

// Infer assignment type from title keywords
function inferType(title: string): ParsedAssignment['type'] {
  const t = title.toLowerCase()
  if (t.includes('lab') || t.includes('notebook') || t.includes('colab')) return 'Lab'
  if (t.includes('discussion') || t.includes('forum')) return 'Discussion'
  if (t.includes('reflection') || t.includes('journal')) return 'Reflection'
  if (t.includes('project') || t.includes('proposal') || t.includes('final') || t.includes('dossier')) return 'Project'
  if (t.includes('quiz') || t.includes('exam') || t.includes('test')) return 'Quiz'
  return 'Assignment'
}

// Infer week number from a module title
function inferWeekNumber(title: string, index: number): number {
  const m = title.match(/(?:week|wk|module|unit|part|section)\s*(\d+)/i)
  return m ? parseInt(m[1]) : index + 1
}

// Main parser — takes an ArrayBuffer of the .imscc zip
// Requires JSZip to be loaded via CDN script tag in app/layout.tsx
export async function parseIMSCC(buffer: ArrayBuffer): Promise<IMSCCParseResult> {
  // JSZip is loaded from CDN in layout.tsx as a global — no npm package needed
  const JSZipGlobal = (typeof window !== 'undefined' && (window as any).JSZip)
  if (!JSZipGlobal) throw new Error('JSZip not loaded. Make sure the CDN script is in your layout.')
  const zip = await JSZipGlobal.loadAsync(buffer)

  // 1. Read manifest
  const manifestFile = zip.file('imsmanifest.xml')
  if (!manifestFile) throw new Error('No imsmanifest.xml found — is this a valid .imscc file?')
  const manifestXML = await manifestFile.async('string')
  const { title: courseTitle, items } = parseManifest(manifestXML)

  const weeks: ParsedWeek[] = []
  const assignments: ParsedAssignment[] = []
  const seenTitles = new Set<string>()

  // 2. Process each module as a week
  for (let moduleIdx = 0; moduleIdx < items.length; moduleIdx++) {
    const module = items[moduleIdx]
    if (!module.title || module.title.toLowerCase().includes('import')) continue

    const weekNum = inferWeekNumber(module.title, moduleIdx)
    const weekReadings: string[] = []
    const weekAssignmentsDue: string[] = []
    let weekDescription = ''
    let weekContent = ''

    // 3. Look for wiki pages / HTML content for this module
    const htmlFiles = Object.keys(zip.files).filter(f =>
      f.endsWith('.html') &&
      (f.includes(module.id) || module.children.some(c => f.includes(c.id)))
    )

    for (const htmlPath of htmlFiles.slice(0, 3)) {
      const htmlFile = zip.file(htmlPath)
      if (!htmlFile) continue
      const html = await htmlFile.async('string')
      const text = stripHTML(html)
      if (text.length > 30) {
        weekContent += text.slice(0, 600) + '\n'
        if (!weekDescription) weekDescription = text.slice(0, 200)

        // Extract URLs as readings
        const urlMatches = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)]
        urlMatches.forEach(m => {
          const url = m[1]
          if (!url.includes('canvas') && !url.includes('instructure') && weekReadings.length < 4) {
            weekReadings.push(url)
          }
        })
      }
    }

    // 4. Check for assignment XML files linked to this module
    for (const child of module.children) {
      const assignmentFiles = Object.keys(zip.files).filter(f =>
        f.includes(child.id) && (f.endsWith('.html') || f.endsWith('.xml'))
      )

      for (const aPath of assignmentFiles) {
        const aFile = zip.file(aPath)
        if (!aFile) continue
        const content = await aFile.async('string')

        // Look for assignment-specific XML fields
        const pointsMatch = content.match(/points_possible[^>]*>([0-9.]+)/i) ||
          content.match(/<score[^>]*>([0-9.]+)/i)
        const points = pointsMatch ? parseFloat(pointsMatch[1]) : 0

        const descText = stripHTML(content).slice(0, 500)
        const aTitle = child.title.trim()

        if (!seenTitles.has(aTitle) && aTitle.length > 2) {
          seenTitles.add(aTitle)
          const aType = inferType(aTitle)

          // Only add as assignment if it looks like one
          if (aType !== 'Assignment' || content.includes('assignment') || content.includes('submit')) {
            weekAssignmentsDue.push(aTitle)
            assignments.push({
              title: aTitle,
              type: aType,
              points,
              week: `Week ${weekNum}`,
              due_date: '',
              description: descText.length > 20 ? descText : `${aTitle} — imported from Canvas. Please add a full description.`,
            })
          }
        }
      }

      // Also catch child titles that look like assignments even without found files
      const cTitle = child.title.trim()
      if (!seenTitles.has(cTitle) && inferType(cTitle) !== 'Assignment' && cTitle.length > 3) {
        seenTitles.add(cTitle)
        weekAssignmentsDue.push(cTitle)
        assignments.push({
          title: cTitle,
          type: inferType(cTitle),
          points: 0,
          week: `Week ${weekNum}`,
          due_date: '',
          description: `${cTitle} — imported from Canvas. Please add a full description.`,
        })
      }
    }

    weeks.push({
      week_number: weekNum,
      topic: module.title,
      description: weekDescription || `Week ${weekNum} content imported from Canvas.`,
      readings: weekReadings,
      assignments_due: weekAssignmentsDue,
      raw_content: weekContent.slice(0, 1000),
    })
  }

  // Sort weeks by number
  weeks.sort((a, b) => a.week_number - b.week_number)

  return { courseName: courseTitle, weeks, assignments, rawManifest: manifestXML.slice(0, 2000) }
}
