// ─────────────────────────────────────────────────────────────
// File Upload Handler
// Accepts image files (jpg, png, webp) up to 5MB
// Saves to persistent REVIEW_UPLOAD_DIR and preserves the /uploads/ URL
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { storeReviewImage, boundedUploadForm } from '@/lib/upload-storage'
import { requireSession } from '@/app/api/auth/_helpers'
import { requireAdmin } from '@/app/api/admin/_helpers'

// ── Constants ────────────────────────────────────────────────

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}


// ── Helpers ──────────────────────────────────────────────────

function error(message: string, status = 400) {
  return NextResponse.json({ status: 'error', message }, { status })
}

function success(data: Record<string, unknown>) {
  return NextResponse.json({ status: 'success', ...data })
}

// ── POST Handler ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Auth required — PHP handled uploads inside the authenticated review
    // submit; the split-out Node route must not accept anonymous writes
    // to public/uploads (disk fill / free image hosting abuse).
    const customerSession = await requireSession()
    const adminSession = customerSession ? null : await requireAdmin()
    if (!customerSession && !adminSession) {
      return error('Not authenticated.', 401)
    }

    if (customerSession) {
      if (!customerSession.emailVerified) return error('Email verification required.', 403)
      const [orders] = await db.query(
        "SELECT o.id FROM orders o LEFT JOIN reviews r ON r.order_id = o.id WHERE o.customer_id = ? AND o.order_status = 'delivered' AND r.id IS NULL LIMIT 1", [customerSession.customerId]
      )
      if (!orders.length) return error('An eligible delivered order is required.', 403)
    }
    const owner = customerSession ? `c${customerSession.customerId}` : `a${adminSession!.customerId}`
    if (!checkRateLimit(`upload:${owner}`, 10, 60 * 60 * 1000).allowed) return error('Too many uploads.', 429)
    const formData = await boundedUploadForm(request)
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return error('No file uploaded. Use form field name "file".')
    }

    // Validate file type
    const extension = ALLOWED_TYPES[file.type]
    if (!extension) {
      return error(
        `Invalid file type: ${file.type}. Allowed: JPG, PNG, WebP.`
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return error(
        `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum: 5MB.`
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const filename = await storeReviewImage(owner, extension, buffer)

    // Return the public URL
    const url = `/uploads/${filename}`

    return success({ url, filename, size: file.size })
  } catch (e) {
    console.error('Upload error:', e)
    return error('File upload failed.', 500)
  }
}
