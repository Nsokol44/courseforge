import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import Sidebar from '@/components/layout/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/auth')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: courses } = await supabase
    .from('courses')
    .select('id, title, number, term, total_points, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="cf-app-layout">
      <Sidebar
        profile={profile}
        courses={courses || []}
        userEmail={user.email || ''}
      />
      <main className="cf-main">
        {children}
      </main>
    </div>
  )
}
