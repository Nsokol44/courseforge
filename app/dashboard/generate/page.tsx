import GenerateCourse from '@/components/course/GenerateCourse'
import { createServerClient } from '@/lib/supabase-server'

export default async function GeneratePage() {
  const supabase = createServerClient()
  const { data: courses } = await supabase
    .from('courses')
    .select('id, title, style_profile')
    .order('created_at', { ascending: false })

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, institution, department')
    .single()

  return (
    <div>
      <div className="cf-topbar">
        <span className="cf-serif" style={{ fontSize: 19, fontWeight: 300 }}>Generate Course</span>
      </div>
      <div className="cf-content">
        <GenerateCourse courses={courses || []} profile={profile} />
      </div>
    </div>
  )
}
