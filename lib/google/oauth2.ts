// ─────────────────────────────────────────────────────────────
// Google OAuth2 Service Account Helper
// Uses jose to sign JWT assertion for token exchange
// ─────────────────────────────────────────────────────────────

import { SignJWT } from 'jose'

interface TokenCache {
  accessToken: string
  expiresAt: number
}

interface ServiceAccountKey {
  client_email: string
  private_key: string
  token_uri: string
}

// Keyed by env var name — GA4 and GSC use separate service accounts,
// so a single shared cache would hand one service the other's token.
const tokenCache = new Map<string, TokenCache>()

function parseServiceAccount(encodedJson: string): ServiceAccountKey {
  const decoded = Buffer.from(encodedJson, 'base64').toString('utf-8')
  const key = JSON.parse(decoded)
  if (!key.client_email || !key.private_key) {
    throw new Error('Invalid service account JSON: missing client_email or private_key')
  }
  return {
    client_email: key.client_email,
    private_key: key.private_key,
    token_uri: key.token_uri || 'https://oauth2.googleapis.com/token',
  }
}

export async function getAccessToken(envVar: string): Promise<string> {
  const encodedJson = process.env[envVar]
  if (!encodedJson) throw new Error(`${envVar} not configured`)

  // Return cached token if still valid (with 5 min buffer)
  const cached = tokenCache.get(envVar)
  if (cached && cached.expiresAt > Date.now() + 300000) {
    return cached.accessToken
  }

  const sa = parseServiceAccount(encodedJson)
  const now = Math.floor(Date.now() / 1000)

  // Create JWT assertion
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(sa.token_uri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPrivateKey(sa.private_key))

  // Exchange JWT for access token
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const data = await res.json() as { access_token?: string; expires_in?: number; error?: string }
  if (!res.ok || data.error) throw new Error(`OAuth2 error: ${data.error || res.statusText}`)
  if (!data.access_token) throw new Error('No access_token in OAuth2 response')

  tokenCache.set(envVar, {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  })

  return data.access_token
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM headers and newlines
  const b64 = pem
    .replace(/-----.*?PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')

  const binaryDer = Uint8Array.from(Buffer.from(b64, 'base64'))

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

export function clearTokenCache(): void {
  tokenCache.clear()
}
