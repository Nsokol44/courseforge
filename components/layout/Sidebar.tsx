'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase-browser'
import type { Course, Profile } from '@/types'
import Link from 'next/link'
import toast from 'react-hot-toast'

interface Props {
  profile: Profile | null
  courses: Pick<Course, 'id' | 'title' | 'number' | 'term' | 'total_points'>[]
  userEmail: string
}

export default function Sidebar({ profile, courses, userEmail }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createBrowserClient()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [localCourses, setLocalCourses] = useState(courses)

  const displayName = profile?.full_name || userEmail.split('@')[0]
  const initial = displayName.charAt(0).toUpperCase()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth')
    router.refresh()
  }

  async function deleteCourse(e: React.MouseEvent, courseId: string, courseTitle: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Delete "${courseTitle}"?\n\nThis permanently removes the course, all weeks, assignments, and enrichment history. This cannot be undone.`)) return
    setDeletingId(courseId)
    try {
      const { error } = await supabase.from('courses').delete().eq('id', courseId)
      if (error) throw error
      setLocalCourses(prev => prev.filter(c => c.id !== courseId))
      toast.success(`"${courseTitle}" deleted`)
      if (pathname.includes(courseId)) router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
    { href: '/dashboard/generate', label: 'Generate Course', icon: '✦' },
    { href: '/dashboard/export', label: 'Export', icon: '↓' },
    { href: '/dashboard/settings', label: 'Settings', icon: '⚙' },
  ]

  return (
    <aside className="cf-sidebar">
      <div className="cf-sidebar-logo">
        <div className="cf-serif" style={{ fontSize: 19, fontWeight: 500, color: 'var(--cf-paper)' }}>
          Course<em style={{ color: 'var(--cf-gold2)' }}>Forge</em>
        </div>
        <div className="cf-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', marginTop: 2, letterSpacing: '0.4px' }}>
          // AI Course Design Platform
        </div>
      </div>

      <div className="cf-sidebar-prof">
        <div className="cf-avatar">{initial}</div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--cf-paper)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
            {displayName}
          </div>
          <div className="cf-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
            {profile?.department || profile?.institution || 'Faculty'}
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="cf-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase', letterSpacing: '1px', padding: '0 8px', marginBottom: 4 }}>
          Workspace
        </div>
        {navItems.map(item => (
          <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
            <button className={`cf-nav-btn ${pathname === item.href ? 'is-active' : ''}`}>
              <span>{item.icon}</span> {item.label}
            </button>
          </Link>
        ))}
      </div>

      <div style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
        <div className="cf-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase', letterSpacing: '1px', padding: '0 8px', marginBottom: 5 }}>
          My Courses
        </div>
        {localCourses.length === 0 ? (
          <div className="cf-mono" style={{ padding: '7px 9px', fontSize: 11, color: 'rgba(255,255,255,0.22)' }}>
            No courses yet
          </div>
        ) : (
          localCourses.map(c => (
            <div key={c.id} style={{ position: 'relative' }}
              onMouseEnter={() => setHoveredId(c.id)}
              onMouseLeave={() => setHoveredId(null)}>
              <Link href={`/dashboard/courses/${c.id}`} style={{ textDecoration: 'none' }}>
                <div className={`cf-course-pill ${pathname.includes(c.id) ? 'is-active' : ''}`}
                  style={{ paddingRight: hoveredId === c.id ? 28 : undefined }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: pathname.includes(c.id) ? 'var(--cf-gold2)' : 'rgba(255,255,255,0.72)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.number ? `${c.number} — ` : ''}{c.title}
                  </div>
                  <div className="cf-mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.26)', marginTop: 1 }}>
                    {c.term || '—'} · {c.total_points || 0} pts
                  </div>
                </div>
              </Link>
              {hoveredId === c.id && (
                <button
                  onClick={e => deleteCourse(e, c.id, c.title)}
                  disabled={deletingId === c.id}
                  title="Delete course"
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'rgba(139,58,42,0.25)', border: '1px solid rgba(139,58,42,0.4)', borderRadius: 4, color: '#e07060', cursor: 'pointer', fontSize: 12, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, zIndex: 2 }}>
                  {deletingId === c.id ? '…' : '✕'}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div style={{ padding: '10px 8px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <Link href="/dashboard/courses/new" style={{ textDecoration: 'none' }}>
          <button style={{ width: '100%', padding: '8px', background: 'rgba(184,134,11,0.14)', border: '1px solid rgba(184,134,11,0.28)', borderRadius: 6, color: 'var(--cf-gold2)', fontFamily: 'var(--cf-sans)', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 5 }}>
            + Add Course
          </button>
        </Link>
        <button onClick={signOut} style={{ width: '100%', padding: '7px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--cf-mono)', fontSize: 10, cursor: 'pointer', textAlign: 'center' }}>
          Sign out
        </button>
      </div>
    </aside>
  )
}
