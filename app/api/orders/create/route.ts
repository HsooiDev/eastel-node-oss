// ─────────────────────────────────────────────────────────────
// POST /api/orders/create
// Create Eastel SIM order + ToyyibPay payment bill
// Session-optional: guests and logged-in customers can both order.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import db from '@/lib/db'
import { requireSession, error, getClientIp } from '@/app/api/auth/_helpers'
import { verifyTurnstile } from '@/lib/turnstile'
import { checkRateLimit } from '@/lib/rate-limit'
import { createBill } from '@/lib/toyyibpay'
import { toCents, formatDate } from '@/lib/db-helpers'
import { randomBytes } from 'node:crypto'
import { hashPassword } from '@/lib/auth'
import { escapeHtml } from '@/lib/security'
import { voucherIssueWelcome } from '@/lib/vouchers'
import { sendEmail, sendOrderConfirmation } from '@/lib/email'
import { SITE_URL } from '@/lib/site'
import { ensureOrderPlanColumns } from '@/lib/migrate'
import { OrderPlanSelectionError, resolveOrderPlanSelection } from '@/lib/order-plan'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'

function generateOrderRef(): string {
  const now = new Date()
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const rand = randomBytes(4).toString('hex').toUpperCase()
  return `ORD-${dateStr}-${rand}`
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    const rl = checkRateLimit(`order:${ip}`, 10, 15 * 60_000)
    if (!rl.allowed) {
      return error('Too many order attempts. Please try again later.', 429)
    }

    // Session is optional — guests can order without logging in
    const session = await requireSession()
    if (session && !session.emailVerified) {
      return error('Please verify your email before placing an order.', 403)
    }

    const body = await request.json()

    // Accept both Turnstile field names (widget posts cf-turnstile-response; some
    // legacy frontend code sends turnstileToken)
    const turnstileToken = String(body['cf-turnstile-response'] ?? body.turnstileToken ?? '')
    if (!(await verifyTurnstile(turnstileToken, ip, { hostname: new URL(SITE_URL).hostname, action: 'order' }))) {
      return error('Security check failed.')
    }

    const {
      full_name,
      email,
      phone,
      alt_phone,
      address_line1,
      address_line2,
      postcode,
      city,
      state,
      courier_id,
      lang = 'en',
      email_verify_token,
      guest_override = false,
      payment_method = 'fpx',
      voucher_code,
      plan_id,
      plan_price_cents,
    } = body

    if (!full_name || !email || !phone || !address_line1 || !postcode || !city || !state || !courier_id) {
      return error('Missing required fields.')
    }

    if (!/^(\+?60|0)[0-9]{8,10}$/.test(String(phone).replace(/[\s-]/g, ''))) {
      return error('Invalid Malaysian phone number format.')
    }

    if (!/^\d{5}$/.test(String(postcode))) {
      return error('Invalid postcode format.')
    }

    const orderEmail = String(email).toLowerCase().trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orderEmail) || orderEmail.length > 254) return error('Invalid email address.')
    if (!Number.isInteger(Number(courier_id)) || Number(courier_id) <= 0) return error('Invalid courier.')
    if (![full_name, address_line1, city, state].every(value => typeof value === 'string' && value.trim().length > 0)) return error('Invalid order details.')
    if (String(full_name).length > 255 || String(address_line1).length > 255 || String(address_line2 ?? '').length > 255 || String(city).length > 100 || String(state).length > 100) return error('Order details are too long.')
    if ((address_line2 != null && typeof address_line2 !== 'string') || (alt_phone != null && (typeof alt_phone !== 'string' || alt_phone.length > 20))) return error('Invalid optional order details.')
    if (typeof phone !== 'string') return error('Invalid phone number.')
    const orderPhone = phone.replace(/[\s-]/g, '')
    if (!['en', 'ms', 'zh'].includes(lang)) return error('Invalid language.')

    // Resolve the customer's choice against the authoritative current catalogue.
    // A missing choice buys only a SIM; an invalid choice must never disappear.
    let selection: Awaited<ReturnType<typeof resolveOrderPlanSelection>>
    try {
      selection = await resolveOrderPlanSelection(plan_id)
    } catch (planError) {
      if (planError instanceof OrderPlanSelectionError) return error(planError.message, planError.httpStatus)
      console.error('[orders/create] Plan catalogue unavailable:', planError)
      return error('Mobile plan information is temporarily unavailable. Please try again.', 503)
    }
    const { snapshot: planSnapshot, fee: planFee } = selection
    // This optional quote guard asks for another review after a price change.
    // It never determines the fee collected; only the server catalogue does.
    if (plan_price_cents !== undefined && plan_price_cents !== null) {
      if (typeof plan_price_cents !== 'number' || !Number.isSafeInteger(plan_price_cents) || plan_price_cents < 0) return error('Invalid mobile plan price confirmation.')
      if (plan_price_cents !== toCents(planFee)) {
        return NextResponse.json({
          status: 'error',
          error_code: 'plan_price_changed',
          message: 'The mobile plan price has changed. Please review the updated total before paying.',
        }, { status: 409 })
      }
    }

    // ── Read product info from DB ─────────────────────────
    const [productRows] = await db.query<RowDataPacket[]>(
      'SELECT id, name, price, stock FROM products WHERE is_active = 1 ORDER BY sort_order ASC, id ASC LIMIT 1'
    )
    let SIM_FEE = 10.0
    let PRODUCT_NAME = 'Eastel Prepaid SIM Card'
    if (productRows.length > 0) {
      SIM_FEE = parseFloat(String(productRows[0].price))
      PRODUCT_NAME = productRows[0].name
      // stock = -1 means unlimited; 0 means sold out
      if (Number(productRows[0].stock) === 0) {
        return error('Sorry, this product is currently out of stock.')
      }
    } else {
      console.error('[orders/create] Products table returned no active products. Falling back to default SIM fee RM 10.00')
    }

    // ── Email registration check (guests only) ──────────────
    // If the email already belongs to a registered customer and the guest has not
    // explicitly acknowledged they want to place a verified guest order, ask the
    // frontend to prompt login or confirm.
    if (!session) {
      const [custRows] = await db.query<RowDataPacket[]>(
        'SELECT id FROM customers WHERE email = ? LIMIT 1',
        [orderEmail]
      )
      if (custRows.length > 0 && !guest_override) {
        return NextResponse.json(
          {
            status: 'error',
            error_code: 'email_registered',
            message: 'This email is already registered. Please log in to continue.',
          },
          { status: 400 }
        )
      }
    }

    // ── OTP token verification (mandatory for guest checkouts) ──
    if (!session) {
      if (!email_verify_token) {
        return error('Email verification required. Please verify your email first.')
      }
      const [verRows] = await db.query<RowDataPacket[]>(
        `SELECT id FROM email_verifications
         WHERE token = ? AND email = ? AND verified = 1 AND expires_at > NOW()
         LIMIT 1`,
        [String(email_verify_token), orderEmail]
      )
      if (verRows.length === 0) {
        return error('Email verification expired. Please verify your email again.')
      }
    }

    // ── Server-side zone lookup ─────────────────────────────
    const [zoneRows] = await db.query<RowDataPacket[]>(
      'SELECT zone FROM postcode_zones WHERE ? BETWEEN postcode_start AND postcode_end LIMIT 1',
      [Number(postcode)]
    )
    if (zoneRows.length === 0) {
      return error('Postcode not found. Please check your postcode.')
    }
    const deliveryZone = zoneRows[0].zone as 'WM' | 'EM' | 'Labuan'

    // ── Server-side courier fee lookup ──────────────────────
    // Use the zone to pick the correct fee column; never trust the client-sent fee.
    const feeCol =
      deliveryZone === 'WM' ? 'wm_fee' : deliveryZone === 'EM' ? 'em_fee' : 'labuan_fee'
    const [courierRows] = await db.query<RowDataPacket[]>(
      `SELECT id, name, \`${feeCol}\` AS delivery_fee FROM couriers WHERE id = ? AND is_active = 1 LIMIT 1`,
      [Number(courier_id)]
    )
    if (courierRows.length === 0) {
      return error('Selected courier is not available.')
    }
    const deliveryFee = parseFloat(String(courierRows[0].delivery_fee)) || 0

    let discount = 0.00
    if (voucher_code) {
      if (!session) {
        return error('Please log in to use a voucher.')
      }
      const subtotal = SIM_FEE + deliveryFee
      const { voucherValidate } = await import('@/lib/vouchers')
      const valResult = await voucherValidate(voucher_code, session.customerId, subtotal)
      if (!valResult.ok) {
        return error(valResult.message)
      }
      discount = valResult.discount
    }

    // Vouchers apply to SIM + delivery only; the full plan fee is held for the
    // merchant's later purchase after the customer registers their SIM.
    const totalAmount = SIM_FEE + deliveryFee - discount + planFee
    const totalCents = toCents(totalAmount)

    // Do this before creating a payment bill or a guest account. Existing
    // shared PHP databases receive only the four additive plan columns here.
    await ensureOrderPlanColumns()

    // ── Build delivery address string ───────────────────────
    const deliveryAddress = [address_line1, address_line2, postcode, city, state, 'Malaysia']
      .filter(Boolean)
      .join(', ')

    const orderRef = generateOrderRef()
    let customerId: number | null = session?.customerId ?? null
    let createdCustomer = false
    let reclaimedCustomer = false
    const tempPassword = !session ? randomBytes(16).toString('hex') : ''
    const tempHash = !session ? await hashPassword(tempPassword) : ''

    // ── Create ToyyibPay bill ───────────────────────────────
    const siteUrl = SITE_URL
    let billCode: string
    let paymentUrl: string

    let enableDuitNowQR = false
    try {
      const [settings] = await db.query<RowDataPacket[]>('SELECT value FROM payment_settings WHERE `key` = "duitnow_qr_enabled"')
      if (settings.length > 0 && settings[0].value === '1') {
        enableDuitNowQR = true
      }
    } catch (e) {}

    // ── Insert order ────────────────────────────────────────
    const now = formatDate()
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()

      if (!session) {
        // Recheck and consume the mailbox proof in the same transaction as the
        // ownership change. Lock proofs before customers, as email verification does.
        const [proofs] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM email_verifications
           WHERE token = ? AND email = ? AND verified = 1 AND expires_at > NOW()
           LIMIT 1 FOR UPDATE`, [String(email_verify_token), orderEmail]
        )
        if (!proofs.length) {
          await connection.rollback()
          connection.release()
          return error('Email verification expired. Please verify your email again.')
        }
        // Verified guest orders must belong to an account, as in PHP.
        const [customers] = await connection.query<RowDataPacket[]>(
          'SELECT id, email_verified FROM customers WHERE email = ? LIMIT 1 FOR UPDATE', [orderEmail]
        )
        if (customers.length) {
          if (!guest_override) {
            await connection.rollback()
            connection.release()
            return error('This email is already registered. Please log in to continue.')
          }
          customerId = Number(customers[0].id)
          if (Number(customers[0].email_verified) !== 1) {
            // A password chosen before mailbox ownership was proved is untrusted.
            // The customer lock also serializes password-bound session creation.
            await connection.execute(
              `UPDATE customers SET name = ?, phone = ?, password_hash = ?,
               is_temp_pass = 1, email_verified = 1, reset_token = NULL, reset_expires = NULL
               WHERE id = ?`, [String(full_name).trim(), orderPhone, tempHash, customerId]
            )
            await connection.execute("DELETE FROM sessions WHERE customer_id = ? AND role = 'customer'", [customerId])
            reclaimedCustomer = true
          }
        } else {
          const [customer] = await connection.execute<ResultSetHeader>(
            'INSERT INTO customers (name, email, phone, password_hash, is_temp_pass, email_verified) VALUES (?, ?, ?, ?, 1, 1)',
            [String(full_name).trim(), orderEmail, orderPhone, tempHash]
          )
          customerId = customer.insertId
          createdCustomer = true
        }
        await connection.execute('DELETE FROM email_verifications WHERE id = ?', [proofs[0].id])
      } else {
        const [customers] = await connection.query<RowDataPacket[]>(
          'SELECT id, email_verified FROM customers WHERE id = ? LIMIT 1 FOR UPDATE', [session.customerId]
        )
        if (!customers.length || Number(customers[0].email_verified) !== 1) {
          await connection.rollback()
          connection.release()
          return error('Please verify your email before placing an order.', 403)
        }
      }
      // Resolve ownership before external bill creation. The locked, consumed
      // proof serializes duplicate guest requests, so a loser creates no bill.
      // createBill has a bounded timeout; gateway failure rolls back the proof
      // and any account changes so a legitimate customer can retry.
      try {
        const billResult = await createBill({
          billName: PRODUCT_NAME,
          billDescription: planSnapshot ? `Order ${orderRef} incl. ${planSnapshot.plan.name}` : `Order ${orderRef}`,
          billAmount: totalCents,
          billTo: String(full_name),
          billEmail: orderEmail,
          billPhone: orderPhone.replace(/^\+/, ''),
          billReturnUrl: `${siteUrl}/api/payment/return`,
          billCallbackUrl: `${siteUrl}/api/payment/callback`,
          billExternalReferenceNo: orderRef,
          enableDuitNowQR,
        })
        billCode = billResult.billCode
        paymentUrl = billResult.paymentUrl
      } catch (billErr) {
        await connection.rollback()
        connection.release()
        console.error('[orders/create] ToyyibPay failed:', billErr)
        return error('Payment gateway error. Please try again.', 502)
      }
      const [insertResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO orders
          (order_ref, customer_id, courier_id, sim_fee, delivery_fee, total_amount, plan_snapshot, plan_fee,
           voucher_code, voucher_discount, payment_status, order_status,
           full_name, email, phone, alt_phone, delivery_address, address_line1, address_line2,
           city, state, country, postcode, zone, courier_name, bill_code, lang, email_sent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [orderRef, customerId, Number(courier_id), SIM_FEE.toFixed(2), deliveryFee.toFixed(2), totalAmount.toFixed(2),
         planSnapshot ? JSON.stringify(planSnapshot) : null, planFee.toFixed(2),
         discount > 0 ? voucher_code : null, discount.toFixed(2), 'pending', 'pending',
         String(full_name).trim(), orderEmail, orderPhone, alt_phone || null, deliveryAddress,
         String(address_line1), address_line2 || null, String(city), String(state), 'Malaysia',
         String(postcode), deliveryZone, courierRows[0].name, billCode, lang, now, now]
      )
      // PHP orders contain one SIM and no product foreign key. Do not infer
      // inventory mutations from a current product or an historical order.

      // ── Redeem Voucher ──────────────────────────────────────
      if (voucher_code && session && insertResult.insertId) {
        const [vResult] = await connection.execute<ResultSetHeader>(
          `UPDATE customer_vouchers
           SET status = 'redeemed', order_id = ?, redeemed_amount = ?, redeemed_at = NOW()
           WHERE code = ? AND customer_id = ? AND status = 'active'
             AND (expires_at IS NULL OR expires_at >= NOW())`,
          [insertResult.insertId, discount, voucher_code, session.customerId]
        )
        if (vResult.affectedRows === 0) {
          await connection.rollback()
          connection.release()
          return error('Voucher has already been redeemed or expired.', 400)
        }
      }

      await connection.commit()
      connection.release()
    } catch (dbErr) {
      await connection.rollback()
      connection.release()
      console.error('[orders/create] Order insertion failed:', dbErr)
      return error('Failed to create order. Please try again.', 500)
    }

    if ((createdCustomer || reclaimedCustomer) && customerId) {
      if (createdCustomer) void voucherIssueWelcome(customerId)
      void sendEmail(orderEmail, 'Your Eastel Mobile account has been created',
        `<p>Hi ${escapeHtml(String(full_name))},</p><p>Your account was created for your SIM order.</p>
         <p>Email: ${escapeHtml(orderEmail)}<br>Temporary password: ${tempPassword}</p>
         <p><a href="${SITE_URL}/${lang}/account/login">Log in to track your order</a>. Please change your password after logging in.</p>`, lang).catch(() => {})
    }

    // ── Best-effort order confirmation email ────────────────
    // Fire-and-forget: never block the response on email delivery.
    const emailLocale = String(lang) as 'en' | 'ms' | 'zh'
    sendOrderConfirmation(
      orderEmail,
      {
        orderRef,
        customerName: String(full_name),
        productName: PRODUCT_NAME,
        quantity: 1,
        unitPrice: SIM_FEE,
        deliveryFee,
        totalAmount,
        planSnapshot,
        planFee,
        voucherDiscount: discount,
        paymentStatus: 'pending',
        shippingAddress: deliveryAddress,
      },
      emailLocale
    ).catch(() => {})

    return NextResponse.json({
      status: 'success',
      order_ref: orderRef,
      payment_url: paymentUrl,
      total_amount: totalAmount.toFixed(2),
      plan_fee: planFee.toFixed(2),
      plan_snapshot: planSnapshot,
    })
  } catch (e) {
    console.error('[orders/create]', e)
    return error('Failed to create order. Please try again.', 500)
  }
}
