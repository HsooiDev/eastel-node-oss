// ─────────────────────────────────────────────────────────────
// Gemini AI Client for WhatsApp Bot
// Handles conversation-aware AI reply generation
// ─────────────────────────────────────────────────────────────

// ── Configuration ────────────────────────────────────────────

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured')
  }
  return apiKey
}

// ── Types ────────────────────────────────────────────────────

interface GeminiPart {
  text: string
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
    finishReason?: string
  }>
  error?: { message?: string; code?: number }
}

// ── Constants ────────────────────────────────────────────────

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

const DEFAULT_SYSTEM_PROMPT = `You are Eastel Mobile's AI assistant on WhatsApp. Help customers with plans, SIM registration, roaming, and general inquiries. Be friendly and concise. Current plans: EZ15 (RM15/30GB), EZ35 (RM35/200GB), EZ50 (RM50/500GB+3GB roaming), EZ68 (RM68/700GB+5GB roaming), EZ98 (RM98/999GB+10GB roaming). Booster add-ons: EZPLUS (RM10/30GB high-speed data, 10 days, available in Eastel App) and EZROAMPLUS (RM35/10GB roaming data with shared hotspot, follows roaming end date, Roaming Pass required). EZ365D is available: RM240, 240GB 5G/4G data, 30 minutes voice calls, 365 days validity. Customers can choose Buy Now on the plans page to continue through the existing website order flow. EZYEAR remains Coming Soon. Support hotline: 011-70337777.`

const MAX_HISTORY_MESSAGES = 10

// ── Generate Reply ───────────────────────────────────────────

/**
 * Generate an AI reply using Gemini with conversation history support.
 *
 * @param message The incoming user message
 * @param history Previous conversation messages (role + content)
 * @param systemPrompt Optional custom system prompt (uses default if omitted)
 * @returns Generated text reply
 */
export async function generateReply(
  message: string,
  history: Array<{ role: string; content: string }>,
  systemPrompt?: string
): Promise<string> {
  const apiKey = getApiKey()

  // Build conversation contents from history
  const contents: GeminiContent[] = []

  if (history && Array.isArray(history)) {
    const recentHistory = history.slice(-MAX_HISTORY_MESSAGES)
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'model') {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        })
      }
    }
  }

  // Add current message
  contents.push({
    role: 'user',
    parts: [{ text: message.trim() }],
  })

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt ?? DEFAULT_SYSTEM_PROMPT }],
      },
      contents,
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.7,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    }),
  })

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Gemini API rate limit exceeded')
    }
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`)
  }

  const data: GeminiResponse = await response.json()

  if (data.error) {
    throw new Error(`Gemini API error: ${data.error.message ?? 'Unknown error'}`)
  }

  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!reply) {
    throw new Error('Gemini API returned no text in response')
  }

  return reply
}
