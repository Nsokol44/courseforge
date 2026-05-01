import { createServerClient } from '@/lib/supabase-server'
import ExportClient from './ExportClient'

export default async function ExportPage() {
  const supabase = createServerClient()
  const { data: courses } = await supabase
    .from('courses')
    .select(`
      id, title, number, term, total_points,
      weeks(week_number, topic, dates, week_description, concept_overview, readings, assignments, reinforcement_materials),
      assignments(id, title, type, points, week, due_date, description),
      python_activities(id, title, week, description, code),
      realworld_items(id, title, source, url, description, week)
    `)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="cf-topbar">
        <span className="cf-serif" style={{ fontSize: 19, fontWeight: 300 }}>Export to Canvas</span>
      </div>
      <div className="cf-content">
        <ExportClient courses={courses || []} />
      </div>
    </div>
  )
}
