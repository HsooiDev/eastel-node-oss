import type { NextRequest } from 'next/server';
import db from '@/lib/db';
import { requireSession, success, error } from '@/app/api/auth/_helpers';
import { voucherLabel, voucherValidate } from '@/lib/vouchers';
import type { RowDataPacket } from 'mysql2/promise';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get('action');

  if (action === 'welcome_teaser') {
    try {
      const [campaigns] = await db.query<RowDataPacket[]>(
        "SELECT discount_type, discount_value FROM voucher_campaigns WHERE is_welcome = 1 AND is_active = 1 LIMIT 1"
      );
      const camp = campaigns[0];
      if (!camp) {
        return success({ enabled: false });
      }
      return success({
        enabled: true,
        label: voucherLabel(camp.discount_type as 'fixed' | 'percent', Number(camp.discount_value)),
      });
    } catch (e) {
      console.error('[Eastel Voucher] welcome_teaser error:', e);
      return success({ enabled: false });
    }
  }

  if (action === 'my_active') {
    try {
      const session = await requireSession();
      if (!session) {
        return success({ vouchers: [] });
      }

      // Lazily expire stale ones for this customer
      await db.execute(
        "UPDATE customer_vouchers SET status = 'expired' WHERE customer_id = ? AND status = 'active' AND expires_at IS NOT NULL AND expires_at < NOW()",
        [session.customerId]
      );

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT code, discount_type, discount_value, min_spend, max_discount, expires_at
         FROM customer_vouchers
         WHERE customer_id = ? AND status = 'active'
         ORDER BY issued_at DESC`,
        [session.customerId]
      );

      const vouchers = rows.map((v) => ({
        code: v.code,
        label: voucherLabel(v.discount_type as 'fixed' | 'percent', Number(v.discount_value)),
        min_spend: Number(v.min_spend),
        expires_at: v.expires_at,
      }));

      return success({ vouchers });
    } catch (e) {
      console.error('[Eastel Voucher] my_active error:', e);
      return error('Failed to load vouchers.', 500);
    }
  }

  return error('Unknown action.', 400);
}

export async function POST(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  let action = searchParams.get('action');

  let body: any = {};
  try {
    body = await request.json();
  } catch (e) {
    // Ignore if body is empty or not JSON
  }

  if (!action && body.action) {
    action = body.action;
  }

  if (action === 'validate') {
    try {
      const session = await requireSession();
      if (!session) {
        return error('Please log in to use a voucher.', 401);
      }

      const code = (body.code || '').trim();
      const subtotal = Number(body.subtotal || 0);

      if (subtotal <= 0) {
        return error('Add your postcode first to see the total.', 400);
      }

      const res = await voucherValidate(code, session.customerId, subtotal);
      if (!res.ok) {
        return error(res.message, 400);
      }

      return success({
        message: res.message,
        discount: res.discount.toFixed(2),
        code: code,
      });
    } catch (e) {
      console.error('[Eastel Voucher] validate error:', e);
      return error('Could not validate voucher.', 500);
    }
  }

  return error('Unknown action.', 400);
}
