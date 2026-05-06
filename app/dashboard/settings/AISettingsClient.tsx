'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import toast from 'react-hot-toast'
import { GEMINI_MODELS } from '@/lib/ai-provider'

interface Props {
  profile: any
  userId: string
}

export default function AISettingsClient({ profile, userId }: Props) {
  const supabase = createBrowserClient()
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [provider, setProvider] = useState<'claude' | 'gemini'>(profile?.ai_provider || 'claude')
  const [geminiKey, setGeminiKey] = useState(profile?.gemini_api_key || '')
  const [geminiModel, setGeminiModel] = useState(profile?.gemini_model || GEMINI_MODELS[0])
  const [showKey, setShowKey] = useState(false)
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [institution, setInstitution] = useState(profile?.institution || '')
  const [department, setDepartment] = useState(profile?.department || '')

  async function save() {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          institution,
          department,
          ai_provider: provider,
          gemini_api_key: provider === 'gemini' ? geminiKey : null,
          gemini_model: geminiModel,
        })
        .eq('id', userId)
      if (error) throw error
      toast.success('Settings saved')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function testGemini() {
    if (!geminiKey) { toast.error('Enter a Gemini API key first'); return }
    setTesting(true)
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: "CourseForge connection successful"' }] }],
          generationConfig: { maxOutputTokens: 30 },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`)
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (reply.toLowerCase().includes('successful') || reply.length > 0) {
        toast.success(`✓ Gemini connected — Model: ${geminiModel}`)
      } else {
        toast.error('Gemini responded but gave unexpected output')
      }
    } catch (err: any) {
      toast.error(`Gemini test failed: ${err.message}`)
    } finally {
      setTesting(false)
    }
  }

  const sectionStyle = { background: '#fff', border: '1px solid var(--cf-line)', borderRadius: 10, padding: 22, marginBottom: 16 }
  const labelStyle = { fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: 'var(--cf-muted)', fontFamily: 'var(--cf-mono)', display: 'block', marginBottom: 5 }

  return (
    <div style={{ maxWidth: 640 }}>
      <p className="cf-serif" style={{ fontSize: 24, fontWeight: 300, fontStyle: 'italic', marginBottom: 5 }}>Settings</p>
      <p style={{ fontSize: 13, color: 'var(--cf-muted)', marginBottom: 24 }}>
        Configure your profile and AI provider. Changes apply to all future AI calls in CourseForge.
      </p>

      {/* Profile */}
      <div style={sectionStyle}>
        <p className="cf-mono" style={{ ...labelStyle, marginBottom: 14, fontSize: 11 }}>👤 Profile</p>
        <div className="columns">
          <div className="column">
            <div className="field">
              <label style={labelStyle}>Full Name</label>
              <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Dr. Nicholas Sokol" />
            </div>
          </div>
          <div className="column">
            <div className="field">
              <label style={labelStyle}>Institution</label>
              <input className="input" value={institution} onChange={e => setInstitution(e.target.value)} placeholder="University of Tennessee" />
            </div>
          </div>
        </div>
        <div className="field">
          <label style={labelStyle}>Department</label>
          <input className="input" value={department} onChange={e => setDepartment(e.target.value)} placeholder="Department of Geography" />
        </div>
      </div>

      {/* AI Provider */}
      <div style={sectionStyle}>
        <p className="cf-mono" style={{ ...labelStyle, marginBottom: 14, fontSize: 11 }}>🤖 AI Provider</p>
        <p style={{ fontSize: 12.5, color: 'var(--cf-muted)', marginBottom: 16 }}>
          Choose which AI powers CourseForge. Claude is the default and requires no additional setup. Gemini requires your own Google API key.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {([
            { id: 'claude', icon: '⚡', name: 'Claude (Anthropic)', model: 'claude-sonnet-4-5', desc: 'Default — no setup required. Powered by your CourseForge subscription.' },
            { id: 'gemini', icon: '✦', name: 'Gemini (Google)', model: geminiModel, desc: 'Use your own Google AI Studio API key. Supports Gemini Flash and Pro.' },
          ] as { id: 'claude' | 'gemini'; icon: string; name: string; model: string; desc: string }[]).map(p => (
            <div
              key={p.id}
              onClick={() => setProvider(p.id)}
              style={{ padding: '14px 16px', border: `2px solid ${provider === p.id ? 'var(--cf-gold)' : 'var(--cf-line)'}`, borderRadius: 9, cursor: 'pointer', background: provider === p.id ? 'var(--cf-gold-pale)' : '#fff', transition: 'all .15s' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 20 }}>{p.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: provider === p.id ? 'var(--cf-gold)' : 'var(--cf-ink)' }}>{p.name}</div>
                  <div className="cf-mono" style={{ fontSize: 9, color: 'var(--cf-muted2)' }}>{p.model}</div>
                </div>
                {provider === p.id && <span style={{ marginLeft: 'auto', color: 'var(--cf-gold)', fontWeight: 700 }}>✓</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--cf-muted)', lineHeight: 1.5 }}>{p.desc}</div>
            </div>
          ))}
        </div>

        {/* Gemini config — only show when Gemini selected */}
        {provider === 'gemini' && (
          <div style={{ borderTop: '1px solid var(--cf-line)', paddingTop: 16 }}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Gemini Model</label>
              <div className="select is-fullwidth">
                <select value={geminiModel} onChange={e => setGeminiModel(e.target.value)}>
                  {GEMINI_MODELS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div style={{ fontSize: 11, color: 'var(--cf-muted2)', marginTop: 4 }}>
                Flash is faster and cheaper. Pro is more capable for complex generation tasks.
              </div>
            </div>

            <div className="field" style={{ marginBottom: 12 }}>
              <label style={labelStyle}>
                Google AI Studio API Key
                {' '}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--cf-gold)', fontFamily: 'var(--cf-mono)', fontSize: 9 }}>
                  Get one free ↗
                </a>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  type={showKey ? 'text' : 'password'}
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  placeholder="AIza…"
                  style={{ flex: 1, fontFamily: 'var(--cf-mono)', fontSize: 13 }}
                />
                <button className="button is-small" onClick={() => setShowKey(v => !v)} style={{ flexShrink: 0 }}>
                  {showKey ? '🙈 Hide' : '👁 Show'}
                </button>
                <button className="button is-small is-ink" onClick={testGemini} disabled={testing || !geminiKey} style={{ flexShrink: 0 }}>
                  {testing ? <><span className="cf-spin" style={{ marginRight: 5 }} />Testing…</> : '⚡ Test'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--cf-muted2)', marginTop: 4 }}>
                Your key is encrypted at rest in Supabase. It is never logged or shared.
              </div>
            </div>

            <div style={{ padding: '10px 14px', background: 'var(--cf-gold-pale)', border: '1px solid rgba(184,134,11,0.2)', borderRadius: 7, fontSize: 12, color: 'var(--cf-ink)' }}>
              <strong>Free tier:</strong> Google AI Studio gives 1,500 requests/day on Flash and 50 on Pro at no cost — enough for most course generation tasks.
            </div>
          </div>
        )}
      </div>

      <button className="button is-gold is-medium" onClick={save} disabled={saving}>
        {saving ? <><span className="cf-spin" style={{ marginRight: 6 }} />Saving…</> : '✓ Save Settings'}
      </button>
    </div>
  )
}
