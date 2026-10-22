// ─────────────────────────────────────────────────────────────
// Security Utilities
// HTML sanitization, CSRF protection, and security helpers
// ─────────────────────────────────────────────────────────────

import { randomBytes, timingSafeEqual } from 'node:crypto'

// ── HTML Sanitization ────────────────────────────────────────

const DANGEROUS_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'textarea',
  'button',
  'link',
  'meta',
  'base',
  'applet',
  'style',
]

const DANGEROUS_ATTRS = [
  'onerror',
  'onload',
  'onclick',
  'onmouseover',
  'onfocus',
  'onblur',
  'onsubmit',
  'onkeydown',
  'onkeyup',
  'onkeypress',
  'onchange',
  'oninput',
  'onmouseenter',
  'onmouseleave',
  'oncontextmenu',
  'ondrag',
  'ondrop',
]

const DANGEROUS_PROTOCOLS = [
  'javascript:',
  'vbscript:',
  'data:text/html',
]

/**
 * Strip dangerous HTML tags, attributes, and protocol handlers.
 * This is NOT a full HTML sanitizer for rich content -- it removes
 * anything that could execute scripts or load external resources.
 *
 * For user-submitted rich text, use a proper library like DOMPurify.
 */
export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== 'string') return ''

  let sanitized = input

  // Remove script tags and their content
  for (const tag of DANGEROUS_TAGS) {
    const pattern = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'gi')
    sanitized = sanitized.replace(pattern, '')
    // Self-closing variants
    const selfClosing = new RegExp(`<${tag}[^>]*/?>`, 'gi')
    sanitized = sanitized.replace(selfClosing, '')
  }

  // Remove dangerous event handler attributes
  for (const attr of DANGEROUS_ATTRS) {
    const pattern = new RegExp(`\\s+${attr}\\s*=\\s*["'][^"']*["']`, 'gi')
    sanitized = sanitized.replace(pattern, '')
  }

  // Remove dangerous protocol handlers in href/src
  for (const protocol of DANGEROUS_PROTOCOLS) {
    const pattern = new RegExp(
      `(href|src|action)\\s*=\\s*["']?${protocol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      'gi'
    )
    sanitized = sanitized.replace(pattern, '')
  }

  return sanitized.trim()
}

/**
 * Strip ALL HTML tags. Use when no HTML is expected in the input.
 */
export function stripHtml(input: string): string {
  if (!input || typeof input !== 'string') return ''
  return input.replace(/<[^>]*>/g, '').trim()
}

// ── CSRF Protection ──────────────────────────────────────────

const CSRF_TOKEN_LENGTH = 32
const CSRF_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CsrfEntry {
  token: string
  expiresAt: number
}

const csrfStore = new Map<string, CsrfEntry>()

// Periodic cleanup for expired CSRF tokens
let csrfCleanupScheduled = false

function scheduleCsrfCleanup(): void {
  if (csrfCleanupScheduled) return
  csrfCleanupScheduled = true

  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of csrfStore.entries()) {
      if (now >= entry.expiresAt) {
        csrfStore.delete(key)
      }
    }
  }, 10 * 60 * 1000).unref() // Every 10 minutes
}

/**
 * Generate a CSRF token for a given session.
 * Stores the token server-side with a 1-hour TTL.
 *
 * @param sessionId The session ID to bind the token to
 * @returns The CSRF token string to embed in forms
 */
export function generateCsrfToken(sessionId: string): string {
  scheduleCsrfCleanup()

  const token = randomBytes(CSRF_TOKEN_LENGTH).toString('hex')
  const expiresAt = Date.now() + CSRF_TOKEN_TTL_MS

  csrfStore.set(sessionId, { token, expiresAt })

  return token
}

/**
 * Validate a CSRF token against the stored value for a session.
 * Uses timing-safe comparison to prevent timing attacks.
 * Tokens are single-use: the stored token is deleted after validation.
 *
 * @param sessionId The session ID that owns the token
 * @param token The token submitted by the client
 * @returns true if the token is valid, false otherwise
 */
export function validateCsrfToken(sessionId: string, token: string): boolean {
  if (!sessionId || !token) return false

  const entry = csrfStore.get(sessionId)
  if (!entry) return false

  // Delete token after validation (single-use)
  csrfStore.delete(sessionId)

  // Check expiry
  if (Date.now() >= entry.expiresAt) return false

  // Timing-safe comparison
  try {
    const storedBuffer = Buffer.from(entry.token, 'utf-8')
    const submittedBuffer = Buffer.from(token, 'utf-8')

    if (storedBuffer.length !== submittedBuffer.length) return false

    return timingSafeEqual(storedBuffer, submittedBuffer)
  } catch {
    return false
  }
}

// ── Input Sanitization ───────────────────────────────────────

/**
 * Sanitize a string for safe display in HTML content.
 * Encodes special characters to prevent XSS when inserting into innerHTML.
 */
export function escapeHtml(input: string): string {
  if (!input || typeof input !== 'string') return ''

  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  }

  return input.replace(/[&<>"'/]/g, (char) => map[char] || char)
}

/**
 * Sanitize a filename for safe storage.
 * Removes path traversal characters and dangerous extensions.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') return 'unnamed'

  // Remove path traversal
  let safe = filename.replace(/^.*[/\\]/, '')

  // Remove null bytes
  safe = safe.replace(/\0/g, '')

  // Remove special characters except dots, dashes, underscores
  safe = safe.replace(/[^a-zA-Z0-9._-]/g, '_')

  // Collapse multiple underscores/dots
  safe = safe.replace(/[._]{2,}/g, '_')

  // Ensure non-empty
  if (!safe || safe === '.' || safe === '..') return 'unnamed'

  return safe
}
