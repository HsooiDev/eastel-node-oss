// Gemini AI Client — Reusable, project-agnostic
// Shared by: WhatsApp bot, Telegram bot, website chatbot, admin AI tools
// No DB, no sessions, no project-specific logic.

const API = 'https://generativelanguage.googleapis.com/v1beta'

function getKey(): string {
  const k = process.env.GEMINI_API_KEY
  if (!k) throw new Error('GEMINI_API_KEY not configured')
  return k
}

// ── Types ────────────────────────────────────────────────────

export interface GeminiContent {
  role: 'user' | 'model'
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
  error?: { message?: string; code?: number }
}

export interface GenerateOptions {
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  fallbackModels?: string[]
}

// ── Text Generation (with fallback cascade) ──────────────────

export async function generate(
  model: string,
  contents: GeminiContent[],
  opts: GenerateOptions = {}
): Promise<{ text: string; model: string; attempts: number }> {
  const cascade = [model, ...(opts.fallbackModels || [])]
  let lastError: Error | null = null

  for (let i = 0; i < cascade.length; i++) {
    try {
      const text = await callGemini(cascade[i], contents, opts)
      return { text, model: cascade[i], attempts: i + 1 }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (i < cascade.length - 1) continue
    }
  }

  throw lastError || new Error('All models exhausted')
}

async function callGemini(
  model: string,
  contents: GeminiContent[],
  opts: GenerateOptions
): Promise<string> {
  const res = await fetch(`${API}/models/${model}:generateContent?key=${getKey()}`, {
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: opts.systemPrompt
        ? { parts: [{ text: opts.systemPrompt }] }
        : undefined,
      contents,
      generationConfig: {
        temperature: opts.temperature ?? 0.7,
        maxOutputTokens: opts.maxTokens ?? 1024,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    }),
  })

  if (!res.ok) {
    if (res.status === 429) throw new Error('Gemini rate limit exceeded')
    throw new Error(`Gemini HTTP ${res.status}`)
  }

  const data: GeminiResponse = await res.json()
  if (data.error) throw new Error(data.error.message || 'Gemini API error')

  const parts = data.candidates?.[0]?.content?.parts || []
  const textPart = parts.find((p: any) => p.text && !p.thought)
  const text = textPart?.text?.trim()
  if (!text) throw new Error('Gemini returned no text')
  return text
}

// ── Convenience: Simple Reply ────────────────────────────────

export async function generateReply(
  model: string,
  message: string,
  history: Array<{ role: string; content: string }>,
  systemPrompt?: string,
  fallbackModels?: string[]
): Promise<{ text: string; model: string }> {
  const contents: GeminiContent[] = []

  if (history?.length) {
    for (const h of history.slice(-10)) {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }],
      })
    }
  }

  contents.push({ role: 'user', parts: [{ text: message.trim() }] })

  const result = await generate(model || 'gemini-2.0-flash', contents, {
    systemPrompt,
    fallbackModels: fallbackModels || ['gemini-2.5-flash', 'gemini-1.5-flash'],
  })

  return { text: result.text, model: result.model }
}

// ── Vision (Multimodal) ──────────────────────────────────────

export async function generateVision(
  model: string,
  prompt: string,
  imageBase64: string,
  mimeType: string = 'image/jpeg',
  systemPrompt?: string
): Promise<string> {
  const contents: GeminiContent[] = [{
    role: 'user',
    parts: [
      { text: prompt },
      { inlineData: { mimeType, data: imageBase64 } },
    ],
  }]

  const result = await generate(model || 'gemini-2.0-flash', contents, { systemPrompt })
  return result.text
}

// ── Image Generation (Imagen 3) ──────────────────────────────

export async function generateImage(
  prompt: string,
  model: string = 'imagen-3.0-generate-001',
  opts: { numberOfImages?: number; aspectRatio?: string } = {}
): Promise<string[]> {
  const res = await fetch(`${API}/models/${model}:predict?key=${getKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: opts.numberOfImages || 1,
        aspectRatio: opts.aspectRatio || '1:1',
      },
    }),
  })

  if (!res.ok) {
    if (res.status === 429) throw new Error('Gemini/Imagen rate limit exceeded')
    const errText = await res.text()
    console.error("Imagen API Error:", errText)
    throw new Error(`Imagen HTTP ${res.status}`)
  }

  const data = await res.json()
  if (data.error) throw new Error(data.error.message || 'Imagen API error')

  const predictions = data.predictions || []
  return predictions.map((p: any) => p.bytesBase64Encoded)
}

// ── Text-to-Speech ───────────────────────────────────────────

export async function textToSpeech(
  text: string,
  model: string = 'gemini-2.5-flash-preview-tts'
): Promise<{ audioBase64: string; mimeType: string }> {
  const res = await fetch(`${API}/models/${model}:generateContent?key=${getKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: {
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'en-US-Studio-O' } } },
      },
    }),
  })

  if (!res.ok) throw new Error(`Gemini TTS HTTP ${res.status}`)
  const data = await res.json()

  const audioB64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
  if (!audioB64) throw new Error('Gemini TTS returned no audio')
  return { audioBase64: audioB64, mimeType: 'audio/pcm' }
}

// ── Model Discovery ──────────────────────────────────────────

export async function listModels(): Promise<Array<{ name: string; displayName: string; description?: string }>> {
  const res = await fetch(`${API}/models?key=${getKey()}`)
  if (!res.ok) throw new Error(`Gemini listModels HTTP ${res.status}`)
  const data = await res.json()
  return (data.models || []).map((m: Record<string, unknown>) => ({
    name: m.name as string,
    displayName: (m.displayName as string) || (m.name as string),
    description: m.description as string | undefined,
  }))
}

export async function getModel(model: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}/models/${model}?key=${getKey()}`)
  if (!res.ok) throw new Error(`Gemini getModel HTTP ${res.status}`)
  const data = await res.json()
  return data
}
