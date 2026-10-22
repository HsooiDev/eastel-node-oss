import type { NextRequest } from "next/server";
import db, { getConnection } from "@/lib/db";
import { requireAdmin, requireAdminCsrf, success, error } from "../_helpers";
import { safeInt } from "@/lib/db-helpers";
import { voucherIssue } from "@/lib/vouchers";
import { logAdminAction } from "@/lib/audit";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "list_campaigns") {
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT id, name, discount_type, discount_value, min_spend, max_discount,
                validity_days, is_welcome, is_active, created_at
         FROM voucher_campaigns ORDER BY is_welcome DESC, id DESC`
      );
      return success({ campaigns: rows });
    }

    if (action === "list_issued") {
      const status = url.searchParams.get("status") || "";
      const limit = safeInt(url.searchParams.get("limit"), 100, 1, 500);
      
      const conditions: string[] = [];
      const params: unknown[] = [];
      
      if (["active", "redeemed", "expired"].includes(status)) {
        conditions.push("cv.status = ?");
        params.push(status);
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT cv.id, cv.code, cv.discount_type, cv.discount_value, cv.status,
                cv.order_id, cv.redeemed_amount, cv.issued_at, cv.expires_at, cv.redeemed_at,
                c.email AS customer_email, c.name AS customer_name
         FROM customer_vouchers cv
         LEFT JOIN customers c ON c.id = cv.customer_id
         ${whereClause}
         ORDER BY cv.id DESC
         LIMIT ${limit}`,
        params
      );
      return success({ vouchers: rows });
    }

    return error("Unknown action.", 400);
  } catch (e) {
    console.error("Admin Vouchers GET error:", e);
    return error("Failed to load data.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated or CSRF invalid.", 401);

    const body = await request.json();
    const { action, ...data } = body;

    if (action === "save_campaign") {
      const id = safeInt(data.id, 0);
      const name = String(data.name || "").trim();
      const type = ["fixed", "percent"].includes(data.discount_type) ? data.discount_type : "fixed";
      const value = Math.max(0, Number(data.discount_value || 0));
      const minSpend = Math.max(0, Number(data.min_spend || 0));
      const maxDiscount = (data.max_discount === "" || data.max_discount === null || data.max_discount === undefined)
        ? null
        : Math.max(0, Number(data.max_discount));
      const validityDays = Math.max(0, safeInt(data.validity_days, 30));
      const isWelcome = data.is_welcome ? 1 : 0;
      const isActive = data.is_active ? 1 : 0;

      if (!name) return error("Name is required.");
      if (type === "percent" && value > 100) return error("Percent discount cannot exceed 100.");

      const conn = await getConnection();
      try {
        await conn.beginTransaction();

        // Only one welcome campaign allowed — clear the flag on others
        if (isWelcome) {
          if (id) {
            await conn.execute("UPDATE voucher_campaigns SET is_welcome = 0 WHERE id <> ?", [id]);
          } else {
            await conn.execute("UPDATE voucher_campaigns SET is_welcome = 0");
          }
        }

        if (id > 0) {
          await conn.execute(
            `UPDATE voucher_campaigns
             SET name=?, discount_type=?, discount_value=?, min_spend=?, max_discount=?,
                 validity_days=?, is_welcome=?, is_active=?
             WHERE id=?`,
            [name, type, value, minSpend, maxDiscount, validityDays, isWelcome, isActive, id]
          );
        } else {
          const [result] = await conn.execute<ResultSetHeader>(
            `INSERT INTO voucher_campaigns
             (name, discount_type, discount_value, min_spend, max_discount, validity_days, is_welcome, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, type, value, minSpend, maxDiscount, validityDays, isWelcome, isActive]
          );
          data.id = result.insertId;
        }

        await conn.commit();
        void logAdminAction(session.customerId, "save_voucher_campaign", "voucher_campaigns", Number(data.id) || null, null,
          JSON.stringify({ name, type, value, is_welcome: isWelcome, is_active: isActive }));
        return success({ message: "Campaign saved.", id: data.id });
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }

    if (action === "delete_campaign") {
      const id = safeInt(data.id, 0);
      if (id <= 0) return error("Invalid ID.");

      await db.execute("DELETE FROM voucher_campaigns WHERE id = ?", [id]);
      void logAdminAction(session.customerId, "delete_voucher_campaign", "voucher_campaigns", id);
      return success({ message: "Campaign deleted." });
    }

    if (action === "issue_to_email") {
      const campId = safeInt(data.campaign_id, 0);
      const email = String(data.email || "").trim().toLowerCase();
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (campId <= 0 || !emailRegex.test(email)) {
        return error("Campaign and valid email required.");
      }

      const [customers] = await db.query<RowDataPacket[]>(
        "SELECT id FROM customers WHERE email = ? LIMIT 1",
        [email]
      );
      const cust = customers[0];
      if (!cust) return error("No customer with that email found.");

      const [campaigns] = await db.query<RowDataPacket[]>(
        "SELECT * FROM voucher_campaigns WHERE id = ? LIMIT 1",
        [campId]
      );
      const camp = campaigns[0];
      if (!camp) return error("Campaign not found.");

      const code = await voucherIssue(cust.id, {
        id: camp.id,
        discount_type: camp.discount_type as "fixed" | "percent",
        discount_value: Number(camp.discount_value),
        min_spend: Number(camp.min_spend),
        max_discount: camp.max_discount !== null ? Number(camp.max_discount) : null,
        validity_days: Number(camp.validity_days),
      });

      if (!code) return error("Failed to issue voucher.");
      void logAdminAction(session.customerId, "issue_voucher", "customer_vouchers", null, null,
        JSON.stringify({ campaign_id: campId, email, code }));
      return success({ message: "Voucher issued successfully.", code });
    }

    return error("Unknown action.", 400);
  } catch (e) {
    console.error("Admin Vouchers POST error:", e);
    return error("Operation failed.", 500);
  }
}
