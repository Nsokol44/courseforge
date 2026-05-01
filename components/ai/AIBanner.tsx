'use client'

import { useState } from 'react'
import type { CourseContext, ParsedAIData } from '@/types'

interface Props {
  courseContext: CourseContext
  onResult: (text: string, parsed: ParsedAIData) => void
}

const QUICK_ACTIONS = [
  { key: 'critique',  label: '📋 Critique',              id: 'ai-critique-btn' },
  { key: 'bloom',     label: "🧠 Bloom's check",          id: 'ai-bloom-btn'   },
  { key: 'realworld', label: '🌍 Real-world examples',    id: 'ai-realworld-btn' },
  { key: 'python',    label: '🐍 Python activity',        id: 'ai-python-btn'  },
  { key: 'pacing',    label: '📅 Pacing review',          id: 'ai-pacing-btn'  },
  { key: 'improve',   label: '✨ Improve assignments',    id: 'ai-improve-btn' },
]

function formatResponse(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<code style="display:block;background:var(--cf-paper3);padding:8px;border-radius:5px;font-size:10px;white-space:pre;overflow-x:auto;font-family:var(--cf-mono);">$1</code>')
    .replace(/^[- *] (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
}

export default function AIBanner({ courseContext, onResult }: Props) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<string | null>(null)

  async function ask(prompt: string) {
    if (!prompt.trim()) return
    setLoading(true)
    setResponse(null)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, courseContext }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResponse(data.text)
      onResult(data.text, data.parsedData || {})
    } catch (err: any) {
      setResponse(`⚠ Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="cf-ai-bar" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="cf-ai-orb">✦</div>
        <input
          className="input cf-ai-input"
          placeholder="Ask AI anything about this course — critique, Bloom's check, real-world examples, Python activity…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ask(input)}
          disabled={loading}
        />
        <button
          className="button"
          style={{ background: 'var(--cf-gold)', border: 'none', color: 'var(--cf-ink)', fontWeight: 600, whiteSpace: 'nowrap' }}
          onClick={() => ask(input)}
          disabled={loading}
        >
          {loading ? <span className="cf-spin" style={{ marginRight: 6 }} /> : null}
          Ask →
        </button>
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
        {QUICK_ACTIONS.map(a => (
          <button
            key={a.key}
            id={a.id}
            className="cf-quick-prompt"
            onClick={() => ask(a.key)}
            disabled={loading}
          >
            {a.label}
          </button>
        ))}
      </div>

      {response && (
        <div
          className="cf-ai-response"
          dangerouslySetInnerHTML={{ __html: formatResponse(response) }}
        />
      )}
    </div>
  )
}
