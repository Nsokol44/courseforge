import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import EmptyState from '@/components/ui/EmptyState'

export default async function DashboardPage() {
  const supabase = createServerClient()
  const { data: courses } = await supabase
    .from('courses')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)

  if (courses && courses.length > 0) {
    redirect(`/dashboard/courses/${courses[0].id}`)
  }

  return (
    <div>
      <div className="cf-topbar">
        <span className="cf-serif" style={{ fontSize: 19, fontWeight: 300 }}>Dashboard</span>
      </div>
      <EmptyState
        icon="📚"
        title="No courses yet."
        description="Upload a syllabus or Canvas export (.imscc) to get started. CourseForge reads your materials and builds your teaching profile automatically."
        actionLabel="+ Upload Your First Course"
        actionHref="/dashboard/courses/new"
      />
    </div>
  )
}
