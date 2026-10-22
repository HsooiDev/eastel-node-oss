import { createHash } from 'node:crypto'
import { EncryptJWT, jwtDecrypt } from 'jose'
import { z } from 'zod'
import { SITE_URL } from '@/lib/site'

export const checkoutDetailsSchema = z.object({
  full_name: z.string().trim().min(1).max(255),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().regex(/^(\+?60|0)[0-9]{8,10}$/),
  alt_phone: z.string().trim().max(20).optional(),
  address_line1: z.string().trim().min(1).max(255),
  address_line2: z.string().trim().max(255).optional(),
  postcode: z.string().regex(/^\d{5}$/),
  city: z.string().trim().min(1).max(100),
  state: z.enum(['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya']),
}).strict()

const audience = 'eastel-ai-checkout-details'
export const CHECKOUT_DETAILS_TTL_SECONDS = 15 * 60

function key(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) throw new Error('Checkout detail encryption is unavailable')
  // Domain separation prevents using these tokens as session/authentication JWTs.
  return createHash('sha256').update(`eastel/ai-checkout-details/v1\0${secret}`).digest()
}

function issuer(): string {
  const origin = new URL(SITE_URL)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && local)) {
    throw new Error('Assisted checkout requires HTTPS')
  }
  return origin.origin
}

export async function encryptCheckoutDetails(details: unknown): Promise<string> {
  const parsed = checkoutDetailsSchema.parse(details)
  return new EncryptJWT({ details: parsed })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'JWT' })
    .setIssuer(issuer())
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${CHECKOUT_DETAILS_TTL_SECONDS}s`)
    .encrypt(key())
}

export async function decryptCheckoutDetails(token: string) {
  const { payload } = await jwtDecrypt(token, key(), {
    issuer: issuer(), audience,
    keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'],
    requiredClaims: ['exp', 'iat'], maxTokenAge: `${CHECKOUT_DETAILS_TTL_SECONDS}s`,
  })
  return checkoutDetailsSchema.parse(payload.details)
}
