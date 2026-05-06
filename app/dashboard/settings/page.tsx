import { createServerClient } from '@/lib/supabase-server'
import AISettingsClient from './AISettingsClient'

export default async function SettingsPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, institution, department, ai_provider, gemini_api_key, gemini_model')
    .eq('id', user?.id)
    .single()

  return (
    <div>
      <div className="cf-topbar">
        <span className="cf-serif" style={{ fontSize: 19, fontWeight: 300 }}>Settings</span>
      </div>
      <div className="cf-content">
        <AISettingsClient profile={profile} userId={user?.id || ''} />
      </div>
    </div>
  )
}
