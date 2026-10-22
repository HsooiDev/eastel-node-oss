# Payment Rules (ToyyibPay)

## Overview

Eastel uses **ToyyibPay** — a Malaysian FPX (online banking) gateway.
Chosen because it does **not require SSM company registration**.
Do not replace with Stripe or other international gateways without verifying SSM implications.

## Flow

```
1. Customer fills order form → POST /api/orders/create
2. Server validates, creates order (payment_status: 'pending'), calls ToyyibPay createBill
3. Returns { payment_url } → frontend redirects to ToyyibPay
4. Customer pays on ToyyibPay hosted page
5. ToyyibPay POSTs callback to /api/payment/callback (server-to-server)
6. ToyyibPay redirects browser to /api/payment/return → /{locale}/thankyou
```

## Critical Rules

- `billAmount` is in **cents** — RM 35.00 = `3500`. Wrong unit = wrong charge.
- `billCallbackUrl` must be publicly accessible — no auth guard on callback route.
- Callback fires **before** browser redirect — server callback is authoritative.
- Duplicate callbacks expected — use `UPDATE ... WHERE payment_status = 'pending'` for idempotency.
- Use separate test `userSecretKey` for staging.

## Callback Fields

| Field | Value |
|---|---|
| `billcode` | Bill code from createBill |
| `order_id` | Your `billExternalReferenceNo` (order_ref) |
| `status_id` | `1` = paid, `2` = pending, `3` = failed |
| `msg` | Human-readable status |
| `transaction_id` | ToyyibPay transaction reference |

## After Payment Success

- Update order: `payment_status = 'paid'`
- Send order confirmation email to customer
- Response: 200 OK to ToyyibPay

## Config

Env vars in `.env.local`:
- `TOYYIBPAY_USER_SECRET`
- `TOYYIBPAY_CATEGORY_CODE`
- `NEXT_PUBLIC_SITE_URL` (no trailing slash)

## Files

- `lib/toyyibpay.ts` — createBill helper
- `app/api/orders/create/route.ts` — order creation + bill creation
- `app/api/payment/callback/route.ts` — server-to-server callback
- `app/api/payment/return/route.ts` — browser redirect handler
