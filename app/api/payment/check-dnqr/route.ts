import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const userSecretKey = process.env.TOYYIBPAY_SECRET_KEY
    const baseUrl = process.env.TOYYIBPAY_BASE_URL || 'https://dev.toyyibpay.com'

    if (!userSecretKey) {
      return NextResponse.json({ status: 'error', message: 'Missing ToyyibPay secret' }, { status: 500 })
    }

    const formData = new URLSearchParams()
    formData.append('userSecretKey', userSecretKey)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(`${baseUrl}/index.php/api/checkDuitNowQRStatus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return NextResponse.json({ status: 'error', message: 'ToyyibPay API error' }, { status: 502 })
    }

    const data = await response.json()
    const available = data && data.status === 'success' && data.duitnowqr_activated

    return NextResponse.json({ status: 'success', available: !!available })
  } catch (error) {
    console.error('[check-dnqr]', error)
    return NextResponse.json({ status: 'error', available: false }, { status: 500 })
  }
}
