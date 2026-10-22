/**
 * Accept only same-origin, single-leading-slash paths for post-auth redirects.
 * Absolute URLs, protocol-relative URLs, backslashes, controls, and encoded
 * external-looking paths are rejected and replaced with the caller's fallback.
 */
export function sanitizeLocalRedirect(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback

  const candidate = value.trim()
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return fallback
  if (/[\\\u0000-\u001f\u007f]/.test(candidate)) return fallback

  let decoded: string
  try {
    decoded = decodeURIComponent(candidate)
  } catch {
    return fallback
  }

  if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decoded)) {
    return fallback
  }

  try {
    const parsed = new URL(candidate, 'https://eastel.invalid')
    if (parsed.origin !== 'https://eastel.invalid') return fallback
  } catch {
    return fallback
  }

  return candidate
}
