'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase-browser'
import toast from 'react-hot-toast'

export default function AuthPage() {
  const router = useRouter()
  const supabase = createBrowserClient()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    email: '', password: '', firstName: '', lastName: '',
    institution: '', department: '',
  })

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: { full_name: `${form.firstName} ${form.lastName}`.trim() },
          },
        })
        if (error) throw error
        // Upsert profile
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase.from('profiles').upsert({
            id: user.id,
            full_name: `${form.firstName} ${form.lastName}`.trim(),
            institution: form.institution,
            department: form.department,
          })
        }
        toast.success('Account created! Welcome to CourseForge.')
        router.push('/dashboard')
        router.refresh()
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        })
        if (error) throw error
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleDemo() {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: 'demo@courseforge.ai',
        password: 'demo-courseforge-2025',
      })
      if (error) {
        // Create demo account if it doesn't exist
        const { error: signUpError } = await supabase.auth.signUp({
          email: 'demo@courseforge.ai',
          password: 'demo-courseforge-2025',
          options: { data: { full_name: 'Professor Demo' } },
        })
        if (signUpError) throw signUpError
      }
      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Left panel */}
      <div className="cf-auth-left">
        <div style={{ marginBottom: 5 }}>
          <span className="cf-serif" style={{ fontSize: 36, fontWeight: 500, color: 'var(--cf-paper)' }}>
            Course<em style={{ color: 'var(--cf-gold2)' }}>Forge</em>
          </span>
        </div>
        <p className="cf-mono" style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 52, letterSpacing: '0.5px' }}>
          // AI-Powered Course Design Platform
        </p>

        {[
          { icon: '📂', title: 'Upload Any Materials', desc: 'Syllabi, .imscc exports, notebooks — AI learns your teaching style from what you provide.' },
          { icon: '✦', title: 'Generate Courses In Your Voice', desc: 'New courses built from your style with assignments, Python activities, and a full semester schedule.' },
          { icon: '↓', title: 'Export to Canvas Instantly', desc: 'Download a .imscc file ready for Canvas import — modules, rubrics, and due dates all mapped.' },
        ].map(f => (
          <div key={f.title} style={{ display: 'flex', gap: 14, marginBottom: 26 }}>
            <div style={{ width: 34, height: 34, border: '1px solid rgba(184,134,11,0.35)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, background: 'rgba(184,134,11,0.08)', flexShrink: 0 }}>
              {f.icon}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cf-paper)', marginBottom: 3 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Right panel */}
      <div className="cf-auth-right">
        <div style={{ width: '100%', maxWidth: 400 }}>
          <h1 className="cf-serif" style={{ fontSize: 27, fontWeight: 500, marginBottom: 5 }}>
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--cf-muted)', marginBottom: 28 }}>
            {mode === 'signin' ? 'Sign in to access your courses.' : 'Set up your professor account.'}
          </p>

          {/* Toggle */}
          <div style={{ display: 'flex', background: 'var(--cf-paper2)', border: '1px solid var(--cf-line)', borderRadius: 9, padding: 3, marginBottom: 26, gap: 3 }}>
            {(['signin', 'signup'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{ flex: 1, padding: '8px', border: 'none', borderRadius: 7, fontFamily: 'var(--cf-sans)', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all .2s', background: mode === m ? 'var(--cf-ink)' : 'none', color: mode === m ? 'var(--cf-paper)' : 'var(--cf-muted)' }}>
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <>
                <div className="columns is-mobile mb-0">
                  <div className="column">
                    <div className="field">
                      <label className="label cf-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--cf-muted)' }}>First Name</label>
                      <div className="control">
                        <input className="input" value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Jane" required />
                      </div>
                    </div>
                  </div>
                  <div className="column">
                    <div className="field">
                      <label className="label cf-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--cf-muted)' }}>Last Name</label>
                      <div className="control">
                        <input className="input" value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Smith" required />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="field">
                  <label className="label cf-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--cf-muted)' }}>Institution</label>
                  <div className="control">
                    <input className="input" value={form.institution} onChange={e => set('institution', e.target.value)} placeholder="University of Tennessee" />
                  </div>
                </div>
                <div className="field">
                  <label className="label cf-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--cf-muted)' }}>Title / Department</label>
                  <div className="control">
                    <input className="input" value={form.department} onChange={e => set('department', e.target.value)} placeholder="Assistant Professor, Geography" />
                  </div>
                </div>
              </>
            )}

            <div className="field">
              <label className="label cf-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--cf-muted)' }}>Email</label>
              <div className="control">
                <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@university.edu" required />
              </div>
            </div>
            <div className="field">
              <label className="label cf-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--cf-muted)' }}>Password</label>
              <div className="control">
                <input className="input" type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" minLength={6} required />
              </div>
            </div>

            <button className="button is-ink is-fullwidth mt-4" type="submit" disabled={loading}>
              {loading ? <span className="cf-spin mr-2" /> : null}
              {mode === 'signin' ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0', fontSize: 11, color: 'var(--cf-muted2)', fontFamily: 'var(--cf-mono)' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--cf-line)' }} />
            or
            <div style={{ flex: 1, height: 1, background: 'var(--cf-line)' }} />
          </div>

          <button className="button is-fullwidth" style={{ background: 'var(--cf-paper2)', border: '1px solid var(--cf-line)' }} onClick={handleDemo} disabled={loading}>
            🎓 Try Demo Account
          </button>
        </div>
      </div>
    </div>
  )
}
