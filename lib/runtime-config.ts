// Shared by release preflight and readiness. Report field names, never values.
export const CORE_RUNTIME_KEYS = [
  'DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'JWT_SECRET',
  'TURNSTILE_SECRET_KEY', 'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
] as const

export const RELEASE_RUNTIME_KEYS = [
  ...CORE_RUNTIME_KEYS,
  'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_BASE_URL',
  'TOYYIBPAY_SECRET_KEY', 'TOYYIBPAY_CATEGORY_CODE', 'TOYYIBPAY_BASE_URL',
  'NEXT_PUBLIC_TOYYIBPAY_BASE_URL',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS',
  'MARKETING_SHARE_DIR', 'MARKETING_POSTER_DIR', 'REVIEW_UPLOAD_DIR', 'WHATSAPP_MEDIA_DIR',
] as const

export function validateRuntimeConfig(
  env: Record<string, string | undefined>,
  profile: 'core' | 'release' = 'core',
  expectedOrigin?: string,
): { missing: string[]; invalid: string[] } {
  const keys = profile === 'release' ? RELEASE_RUNTIME_KEYS : CORE_RUNTIME_KEYS
  const missing = keys.filter(key => !env[key]?.trim())
  const invalid = new Set<string>()
  for (const key of keys) {
    const value = env[key]?.trim()
    if (value && /^(?:CHANGE_ME|REPLACE_ME|YOUR_[A-Z_]+|example|changeme)$/i.test(value)) invalid.add(key)
  }
  if (env.JWT_SECRET && Buffer.byteLength(env.JWT_SECRET, 'utf8') < 32) invalid.add('JWT_SECRET')
  if (profile === 'release') {
    // This release path runs on Hostinger; avoid localhost resolving to IPv6.
    if (env.DB_HOST && env.DB_HOST !== '127.0.0.1') invalid.add('DB_HOST')
    for (const key of ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_BASE_URL', 'TOYYIBPAY_BASE_URL', 'NEXT_PUBLIC_TOYYIBPAY_BASE_URL']) {
      if (!env[key]) continue
      try {
        const url = new URL(env[key]!)
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
          || url.pathname !== '/') invalid.add(key)
      } catch { invalid.add(key) }
    }
    if (env.NEXT_PUBLIC_SITE_URL && env.NEXT_PUBLIC_BASE_URL
      && env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '') !== env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')) {
      invalid.add('NEXT_PUBLIC_BASE_URL')
    }
    if (env.TOYYIBPAY_BASE_URL && env.NEXT_PUBLIC_TOYYIBPAY_BASE_URL
      && env.TOYYIBPAY_BASE_URL.replace(/\/$/, '') !== env.NEXT_PUBLIC_TOYYIBPAY_BASE_URL.replace(/\/$/, '')) {
      invalid.add('NEXT_PUBLIC_TOYYIBPAY_BASE_URL')
    }
    if (env.TOYYIBPAY_BASE_URL && !['https://toyyibpay.com', 'https://dev.toyyibpay.com'].includes(env.TOYYIBPAY_BASE_URL.replace(/\/$/, ''))) {
      invalid.add('TOYYIBPAY_BASE_URL')
    }
    if (expectedOrigin && env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') !== expectedOrigin.replace(/\/$/, '')) {
      invalid.add('NEXT_PUBLIC_SITE_URL')
    }
    if (expectedOrigin === 'https://eastel.site' && env.TOYYIBPAY_BASE_URL?.replace(/\/$/, '') !== 'https://toyyibpay.com') {
      invalid.add('TOYYIBPAY_BASE_URL')
    }
    if (env.SMTP_PORT && !['465', '587'].includes(env.SMTP_PORT)) invalid.add('SMTP_PORT')
  }
  return { missing: [...missing], invalid: [...invalid] }
}
