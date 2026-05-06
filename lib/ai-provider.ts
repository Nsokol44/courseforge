import Anthropic from '@anthropic-ai/sdk'

export const GEMINI_MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-pro-preview',
] as const

export interface AIProviderConfig {
  provider: 'claude' | 'gemini'
  geminiApiKey?: string | null
  geminiModel?: string | null
}

// ─────────────────────────────────────────
// Unified text generation call
// Routes to Claude or Gemini based on config
// ─────────────────────────────────────────
export async function callAI(params: {
  system: string
  prompt: string
  maxTokens?: number
  config?: AIProviderConfig | null
}): Promise<string> {
  const { system, prompt, maxTokens = 4000, config } = params
  const provider = config?.provider || 'claude'

  if (provider === 'gemini' && config?.geminiApiKey) {
    return callGemini({
      system,
      prompt,
      maxTokens,
      apiKey: config.geminiApiKey,
      model: config.geminiModel || GEMINI_MODELS[0],
    })
  }

  // Default: Claude
  return callClaude({ system, prompt, maxTokens })
}

async function callClaude(params: {
  system: string
  prompt: string
  maxTokens: number
}): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: params.maxTokens,
    system: params.system,
    messages: [{ role: 'user', content: params.prompt }],
  })
  return (response.content.find(b => b.type === 'text') as any)?.text || ''
}

async function callGemini(params: {
  system: string
  prompt: string
  maxTokens: number
  apiKey: string
  model: string
}): Promise<string> {
  // Gemini REST API — no SDK needed
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${params.apiKey}`

  const body = {
    system_instruction: { parts: [{ text: params.system }] },
    contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
    generationConfig: {
      maxOutputTokens: params.maxTokens,
      temperature: 0.7,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Gemini API error ${res.status}: ${err?.error?.message || res.statusText}`)
  }

  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}
