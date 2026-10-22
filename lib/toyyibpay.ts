// ─────────────────────────────────────────────────────────────
// ToyyibPay Payment Gateway Client
// Handles bill creation and payment URL generation
// ─────────────────────────────────────────────────────────────

// ── Configuration ────────────────────────────────────────────

import { SITE_URL } from '@/lib/site'

function getConfig() {
  const userSecret = process.env.TOYYIBPAY_SECRET_KEY
  const categoryCode = process.env.TOYYIBPAY_CATEGORY_CODE
  const baseUrl = process.env.TOYYIBPAY_BASE_URL || 'https://dev.toyyibpay.com'

  if (!userSecret) {
    throw new Error('TOYYIBPAY_SECRET_KEY environment variable is not configured')
  }
  if (!categoryCode) {
    throw new Error('TOYYIBPAY_CATEGORY_CODE environment variable is not configured')
  }

  return { userSecret, categoryCode, baseUrl }
}

// ── Types ────────────────────────────────────────────────────

export interface CreateBillParams {
  billName: string
  billDescription: string
  billAmount: number // in cents (RM 35.00 = 3500)
  billTo: string // recipient name
  billEmail: string
  billPhone: string
  billReturnUrl: string
  billCallbackUrl: string
  billExternalReferenceNo?: string
  enableDuitNowQR?: boolean
}

export interface CreateBillResult {
  billCode: string
  paymentUrl: string
}

interface ToyyibPayBillResponse {
  BillCode: string
}

// ── Transaction Types ──────────────────────────────────────

export interface ToyyibPayTransaction {
  billpaymentid: string
  billpaymentStatus: string | number
  billpaymentInvoiceNo: string
  billpaymentAmount?: string
  billpaymentDate?: string
}

// ── Get Bill Transactions ──────────────────────────────────

/**
 * Fetch transactions for a bill from ToyyibPay.
 * Used to verify real payment status — never trust the webhook payload.
 *
 * @param billCode ToyyibPay bill code
 * @returns Array of transactions sorted by billpaymentid descending
 */
export async function getBillTransactions(billCode: string): Promise<ToyyibPayTransaction[]> {
  const { userSecret, baseUrl } = getConfig()

  const formData = new URLSearchParams()
  formData.append('userSecretKey', userSecret)
  formData.append('billCode', billCode)

  const response = await fetch(`${baseUrl}/index.php/api/getBillTransactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`ToyyibPay getBillTransactions error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  if (!Array.isArray(data)) {
    return []
  }

  const txns: ToyyibPayTransaction[] = data.map((t: Record<string, unknown>) => ({
    billpaymentid: String(t.billpaymentid ?? t.BillPaymentId ?? ''),
    billpaymentStatus: (t.billpaymentStatus ?? t.billpaymentstatus ?? t.BillPaymentStatus ?? 0) as string | number,
    billpaymentInvoiceNo: String(t.billpaymentInvoiceNo ?? t.billpaymentinvoiceno ?? t.BillPaymentInvoiceNo ?? ''),
    billpaymentAmount: String(t.billpaymentAmount ?? t.billpaymentamount ?? ''),
    billpaymentDate: String(t.billpaymentDate ?? t.billpaymentdate ?? ''),
  }))

  txns.sort((a, b) => parseInt(b.billpaymentid, 10) - parseInt(a.billpaymentid, 10))

  return txns
}

// ── Create Bill ────────────────────────────────────────────

export async function createBill(params: CreateBillParams): Promise<CreateBillResult> {
  const { userSecret, categoryCode, baseUrl } = getConfig()

  const siteUrl = SITE_URL

  const formData = new URLSearchParams()
  formData.append('userSecretKey', userSecret)
  formData.append('categoryCode', categoryCode)
  formData.append('billName', params.billName)
  formData.append('billDescription', params.billDescription)
  formData.append('billPriceSetting', '1')
  formData.append('billPayorInfo', '1')
  formData.append('billAmount', String(params.billAmount))
  formData.append('billTo', params.billTo)
  formData.append('billEmail', params.billEmail)
  formData.append('billPhone', params.billPhone)
  formData.append('billReturnUrl', params.billReturnUrl || `${siteUrl}/api/payment/return`)
  formData.append('billCallbackUrl', params.billCallbackUrl || `${siteUrl}/api/payment/callback`)

  if (params.billExternalReferenceNo) {
    formData.append('billExternalReferenceNo', params.billExternalReferenceNo)
  }

  if (params.enableDuitNowQR) {
    formData.append('enableDuitNowQR', '1')
    formData.append('chargeDuitNowQR', '0') // merchant absorbs fee
  }

  const response = await fetch(`${baseUrl}/index.php/api/createBill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`ToyyibPay API error: ${response.status} ${response.statusText}`)
  }

  const data: ToyyibPayBillResponse[] = await response.json()

  if (!Array.isArray(data) || data.length === 0 || !data[0].BillCode) {
    throw new Error('ToyyibPay returned an invalid response: missing BillCode')
  }

  const billCode = data[0].BillCode
  const paymentUrl = `${baseUrl}/${billCode}`

  return { billCode, paymentUrl }
}
