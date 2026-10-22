// ─────────────────────────────────────────────────────────────
// JWT & Password Utilities
// JWT via jose, PHP-compatible Argon2id writes and legacy hash verification
// ─────────────────────────────────────────────────────────────

import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { argon2, createHash, scrypt, randomBytes, timingSafeEqual } from 'node:crypto'

// ── JWT ──────────────────────────────────────────────────────

export interface AuthJWTPayload extends JWTPayload {
  sub: string
  role: 'customer' | 'admin'
  email: string
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.trim().length === 0) {
    throw new Error('JWT_SECRET environment variable is not configured')
  }
  return new TextEncoder().encode(secret)
}

/**
 * Generate a signed JWT token.
 *
 * @param payload Must include `sub` (user ID), `role`, and `email`
 * @param expires Token lifetime, default 7 days
 */
export async function generateToken(
  payload: { sub: string; role: 'customer' | 'admin'; email: string },
  expires: string = '7d'
): Promise<string> {
  const secret = getJwtSecret()

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expires)
    .setIssuer('eastel')
    .sign(secret)
}

/**
 * Verify and decode a JWT token.
 * Returns the decoded payload or null if invalid/expired.
 */
export async function verifyToken(token: string): Promise<AuthJWTPayload | null> {
  if (!token || token.trim().length === 0) {
    return null
  }

  try {
    const secret = getJwtSecret()
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'eastel',
    })
    return payload as AuthJWTPayload
  } catch {
    return null
  }
}

/**
 * Hash a password-reset bearer token before storing or querying it.
 * PHP uses the same SHA-256 representation in `customers.reset_token`.
 */
export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

// ── Password Hashing ────────────────────────────────────────

const SCRYPT_KEYLEN = 64
const SCRYPT_COST = 16384   // N parameter (CPU/memory cost)
const SCRYPT_BLOCK = 8       // r parameter (block size)
const SCRYPT_PARALLEL = 1    // p parameter (parallelization)

/**
 * Standard PHC Argon2id string understood by PHP password_verify().
 * Keep the full UTF-8 password, including passwords exceeding bcrypt's 72 bytes.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await deriveArgon2('argon2id', password, salt, 65536, 3, 1, 32)
  return `$argon2id$v=19$m=65536,t=3,p=1$${salt.toString('base64').replace(/=+$/, '')}$${key.toString('base64').replace(/=+$/, '')}`
}

function deriveArgon2(algorithm: 'argon2id' | 'argon2i', password: string, salt: Buffer,
  memory: number, passes: number, parallelism: number, tagLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(algorithm, { message: password, nonce: salt, memory, passes, parallelism, tagLength },
      (error, key) => error ? reject(error) : resolve(key))
  })
}

async function verifyArgon2(password: string, storedHash: string): Promise<boolean> {
  const match = /^\$(argon2id|argon2i)\$v=19\$m=(\d{1,6}),t=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9+/]{11,86})\$([A-Za-z0-9+/]{22,86})$/.exec(storedHash)
  if (!match) return false
  const [, algorithm, m, t, p, salt64, key64] = match
  const memory = Number(m), passes = Number(t), parallelism = Number(p)
  const salt = Buffer.from(salt64, 'base64'), expected = Buffer.from(key64, 'base64')
  // Bound work before invoking the KDF, including for malformed database values.
  if (parallelism < 1 || parallelism > 8 || memory < 8 * parallelism || memory > 262144 ||
      passes < 1 || passes > 10 || salt.length < 8 || salt.length > 64 || expected.length < 16 || expected.length > 64 ||
      salt.toString('base64').replace(/=+$/, '') !== salt64 || expected.toString('base64').replace(/=+$/, '') !== key64) return false
  try {
    const key = await deriveArgon2(algorithm as 'argon2id' | 'argon2i', password, salt, memory, passes, parallelism, expected.length)
    return timingSafeEqual(key, expected)
  } catch { return false }
}

/**
 * Verify a password against a stored hash.
 * Accept standard PHP Argon2/bcrypt and existing Node scrypt hashes.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  if (!storedHash || storedHash.trim().length === 0) {
    return false
  }

  if (storedHash.startsWith('$argon2')) return verifyArgon2(password, storedHash)

  // Handle scrypt hashes from this module
  if (storedHash.startsWith('scrypt:')) {
    return verifyScrypt(password, storedHash)
  }

  // Handle bcrypt hashes from the legacy PHP system
  if (storedHash.startsWith('$2y$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$')) {
    return verifyBcryptLegacy(password, storedHash)
  }

  return false
}

/**
 * Verify against a scrypt hash in `scrypt:<salt>:<hash>` format.
 */
function verifyScrypt(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':')
  if (parts.length !== 3) {
    return Promise.resolve(false)
  }

  const [, salt, hashHex] = parts
  if (!/^[0-9a-f]{64}$/i.test(salt) || !/^[0-9a-f]{128}$/i.test(hashHex)) return Promise.resolve(false)

  return new Promise<boolean>((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_COST, r: SCRYPT_BLOCK, p: SCRYPT_PARALLEL },
      (err, derivedKey) => {
        if (err) {
          reject(err)
          return
        }
        const storedBuffer = Buffer.from(hashHex, 'hex')
        if (storedBuffer.length !== derivedKey.length) {
          resolve(false)
          return
        }
        resolve(timingSafeEqual(storedBuffer, derivedKey))
      }
    )
  })
}

/**
 * Verify against a bcrypt hash from the legacy PHP system.
 * Retains PHP bcrypt verification; new writes use Argon2id.
 */
async function verifyBcryptLegacy(
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    const bcrypt = await import("bcryptjs");
    return bcrypt.compare(password, storedHash);
  } catch {
    return false;
  }
}

// ── Validation ───────────────────────────────────────────────

/**
 * Validate an email address format.
 */
export function validateEmail(email: string): boolean {
  if (!email || email.length > 254) return false
  // RFC 5322 simplified pattern
  const pattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  return pattern.test(email)
}

/**
 * Validate a Malaysian phone number.
 * Accepts: +60123456789, 60123456789, 0123456789
 */
export function validatePhone(phone: string): boolean {
  if (!phone) return false
  const pattern = /^(\+?60|0)[0-9]{8,10}$/
  return pattern.test(phone.replace(/[\s-]/g, ''))
}

/**
 * Validate password strength.
 * Requirements: 8-128 chars, at least one uppercase, one lowercase, one digit.
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password) {
    return { valid: false, error: 'Password is required' }
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' }
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password must not exceed 128 characters' }
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' }
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' }
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one digit' }
  }
  return { valid: true }
}
