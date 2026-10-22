import db from "./db";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import crypto from "crypto";

export const VOUCHER_MIN_PAYABLE = 1.00; // RM1 minimum bill amount for ToyyibPay

/**
 * Compute the discount for a given rule and subtotal, applying the
 * subtotal cap and the ToyyibPay RM1 payable floor.
 */
export function voucherComputeDiscount(
  type: "fixed" | "percent",
  value: number,
  max: number | null,
  subtotal: number
): number {
  if (subtotal <= 0) return 0.00;

  let d = 0;
  if (type === "percent") {
    d = subtotal * (value / 100.0);
    if (max !== null && max > 0) d = Math.min(d, max);
  } else {
    d = value;
  }

  // Never discount more than the subtotal, and keep payable >= RM1.00
  const maxAllowed = Math.max(0.0, subtotal - VOUCHER_MIN_PAYABLE);
  d = Math.min(d, maxAllowed);

  return Math.round(Math.max(0.0, d) * 100) / 100;
}

/** Human label for a rule, e.g. "RM5.00" or "10%". */
export function voucherLabel(type: "fixed" | "percent", value: number): string {
  if (type === "percent") {
    return parseFloat(value.toFixed(2)).toString() + "%";
  }
  return "RM" + value.toFixed(2);
}

/** Generate a unique voucher code like "EV-3F9A2B7C". */
export async function voucherGenerateCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = "EV-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT 1 FROM customer_vouchers WHERE code = ? LIMIT 1",
      [code]
    );
    if (rows.length === 0) return code;
  }
  return "EV-" + crypto.randomBytes(6).toString("hex").toUpperCase();
}

/**
 * Issue a voucher to a customer from a campaign row (rules snapshotted).
 * Returns the generated code, or null on failure.
 */
export async function voucherIssue(
  customerId: number,
  campaign: {
    id: number;
    discount_type: "fixed" | "percent";
    discount_value: number;
    min_spend: number;
    max_discount: number | null;
    validity_days: number;
  }
): Promise<string | null> {
  try {
    const code = await voucherGenerateCode();
    const days = Number(campaign.validity_days || 30);
    
    let expiresAt: string | null = null;
    if (days > 0) {
      const d = new Date();
      d.setDate(d.getDate() + days);
      expiresAt = d.toISOString().slice(0, 19).replace("T", " ");
    }

    await db.execute(
      `INSERT INTO customer_vouchers 
       (customer_id, campaign_id, code, discount_type, discount_value, min_spend, max_discount, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        customerId,
        campaign.id,
        code,
        campaign.discount_type,
        campaign.discount_value,
        campaign.min_spend,
        campaign.max_discount,
        expiresAt,
      ]
    );
    return code;
  } catch (e) {
    console.error("[Eastel Voucher] issue failed:", e);
    return null;
  }
}

/**
 * Issue the active welcome voucher to a customer, exactly once.
 * No-op (returns null) if no active welcome campaign or already issued.
 */
export async function voucherIssueWelcome(customerId: number): Promise<string | null> {
  try {
    const [campaigns] = await db.query<RowDataPacket[]>(
      "SELECT * FROM voucher_campaigns WHERE is_welcome = 1 AND is_active = 1 LIMIT 1"
    );
    const camp = campaigns[0];
    if (!camp) return null;

    const [existing] = await db.query<RowDataPacket[]>(
      "SELECT 1 FROM customer_vouchers WHERE customer_id = ? AND campaign_id = ? LIMIT 1",
      [customerId, camp.id]
    );
    if (existing.length > 0) return null; // already issued

    return voucherIssue(customerId, {
      id: camp.id,
      discount_type: camp.discount_type,
      discount_value: Number(camp.discount_value),
      min_spend: Number(camp.min_spend),
      max_discount: camp.max_discount !== null ? Number(camp.max_discount) : null,
      validity_days: Number(camp.validity_days),
    });
  } catch (e) {
    console.error("[Eastel Voucher] issue_welcome failed:", e);
    return null;
  }
}

interface ValidateResult {
  ok: boolean;
  message: string;
  discount: number;
  voucher: any | null;
}

/**
 * Validate a code for a customer against a subtotal.
 * Returns { ok, message, discount, voucher }.
 * Lazily flips expired vouchers to status='expired'.
 */
export async function voucherValidate(
  code: string,
  customerId: number,
  subtotal: number
): Promise<ValidateResult> {
  const cleanCode = code.trim();
  if (!cleanCode) return { ok: false, message: "No voucher code provided.", discount: 0, voucher: null };

  const [vouchers] = await db.query<RowDataPacket[]>(
    "SELECT * FROM customer_vouchers WHERE code = ? LIMIT 1",
    [cleanCode]
  );
  const v = vouchers[0];

  if (!v) return { ok: false, message: "Voucher code not found.", discount: 0, voucher: null };
  if (Number(v.customer_id) !== customerId) return { ok: false, message: "This voucher does not belong to your account.", discount: 0, voucher: null };
  if (v.status === "redeemed") return { ok: false, message: "This voucher has already been used.", discount: 0, voucher: null };
  if (v.status === "expired") return { ok: false, message: "This voucher has expired.", discount: 0, voucher: null };

  if (v.expires_at && new Date(v.expires_at).getTime() < Date.now()) {
    await db.execute("UPDATE customer_vouchers SET status = 'expired' WHERE id = ?", [v.id]);
    return { ok: false, message: "This voucher has expired.", discount: 0, voucher: null };
  }

  if (subtotal <= VOUCHER_MIN_PAYABLE) {
    return { ok: false, message: "Order total is too low to apply a voucher.", discount: 0, voucher: null };
  }

  const minSpend = Number(v.min_spend);
  if (subtotal < minSpend) {
    return { ok: false, message: `Minimum spend of RM${minSpend.toFixed(2)} required.`, discount: 0, voucher: null };
  }

  const maxDiscount = v.max_discount !== null ? Number(v.max_discount) : null;
  const discount = voucherComputeDiscount(
    v.discount_type,
    Number(v.discount_value),
    maxDiscount,
    subtotal
  );

  if (discount <= 0) return { ok: false, message: "This voucher cannot be applied to this order.", discount: 0, voucher: null };

  return { ok: true, message: "Voucher applied.", discount, voucher: v };
}

/**
 * Atomically mark a voucher redeemed. Returns true if exactly one active,
 * non-expired voucher for this customer was flipped (prevents double-spend).
 */
export async function voucherRedeem(
  code: string,
  customerId: number,
  orderId: number,
  discount: number
): Promise<boolean> {
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE customer_vouchers
     SET status = 'redeemed', order_id = ?, redeemed_amount = ?, redeemed_at = NOW()
     WHERE code = ? AND customer_id = ? AND status = 'active'
       AND (expires_at IS NULL OR expires_at >= NOW())`,
    [orderId, discount, code, customerId]
  );
  return result.affectedRows > 0;
}
