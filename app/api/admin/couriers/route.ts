import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { safeInt } from "@/lib/db-helpers";
import { requireAdmin, requireAdminCsrf, success, error } from "../_helpers";
import { adminCourierSchema, adminCourierUpdateSchema, validate } from "@/lib/validation";
import { logAdminAction } from "@/lib/audit";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

// ── GET: List all couriers ──────────────────────────────────

export async function GET() {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const [couriers] = await db.query<RowDataPacket[]>(
      "SELECT * FROM `couriers` ORDER BY `sort_order` ASC, `id` ASC"
    );

    return success({ couriers });
  } catch (e) {
    console.error("Admin couriers GET error:", e);
    return error("Failed to load couriers.", 500);
  }
}

// ── POST: Create a new courier ──────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const body = await request.json();

    const parsed = validate(adminCourierSchema, body);
    if (!parsed.success) {
      return error(parsed.errors?.["_form"] || Object.values(parsed.errors ?? {})[0] || "Validation failed.");
    }
    const { name, tracking_url, wm_fee, em_fee, labuan_fee, is_active, sort_order } = parsed.data;

    // Shift existing couriers to make room at the chosen position
    await db.execute(
      `UPDATE \`couriers\` SET \`sort_order\` = \`sort_order\` + 1 WHERE \`sort_order\` >= ?`,
      [sort_order]
    );

    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO \`couriers\`
        (\`name\`, \`tracking_url\`, \`wm_fee\`, \`em_fee\`, \`labuan_fee\`,
         \`is_active\`, \`sort_order\`)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        tracking_url || null,
        wm_fee.toFixed(2),
        em_fee.toFixed(2),
        labuan_fee.toFixed(2),
        is_active,
        sort_order,
      ]
    );

    void logAdminAction(session.customerId, "add_courier", "couriers", result.insertId, null,
      JSON.stringify({ name, wm: wm_fee, em: em_fee, labuan: labuan_fee }));

    return success({
      message: "Courier created successfully.",
      courierId: result.insertId,
    });
  } catch (e) {
    console.error("Admin couriers POST error:", e);
    return error("Failed to create courier.", 500);
  }
}

// ── PUT: Update an existing courier ─────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const body = await request.json();

    const parsed = validate(adminCourierUpdateSchema, body);
    if (!parsed.success) {
      return error(parsed.errors?.["_form"] || Object.values(parsed.errors ?? {})[0] || "Validation failed.");
    }
    const { id, name, tracking_url, wm_fee, em_fee, labuan_fee, is_active, sort_order } = parsed.data;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) { fields.push("`name` = ?"); values.push(name); }
    if (tracking_url !== undefined) { fields.push("`tracking_url` = ?"); values.push(tracking_url || null); }
    if (wm_fee !== undefined) { fields.push("`wm_fee` = ?"); values.push(wm_fee.toFixed(2)); }
    if (em_fee !== undefined) { fields.push("`em_fee` = ?"); values.push(em_fee.toFixed(2)); }
    if (labuan_fee !== undefined) { fields.push("`labuan_fee` = ?"); values.push(labuan_fee.toFixed(2)); }
    if (is_active !== undefined) { fields.push("`is_active` = ?"); values.push(is_active); }
    if (sort_order !== undefined) { fields.push("`sort_order` = ?"); values.push(sort_order); }

    if (fields.length === 0) return error("No fields to update.");

    // Rebalance sort_order if it's being changed
    if (sort_order !== undefined) {
      const [oldRows] = await db.query<RowDataPacket[]>(
        "SELECT `sort_order` AS old_order FROM `couriers` WHERE `id` = ? LIMIT 1",
        [id]
      );
      const oldOrder = oldRows[0]?.old_order as number | undefined;
      if (oldOrder !== undefined && sort_order !== oldOrder) {
        if (sort_order < oldOrder) {
          await db.execute(
            `UPDATE \`couriers\` SET \`sort_order\` = \`sort_order\` + 1
             WHERE \`sort_order\` >= ? AND \`sort_order\` < ? AND \`id\` != ?`,
            [sort_order, oldOrder, id]
          );
        } else {
          await db.execute(
            `UPDATE \`couriers\` SET \`sort_order\` = \`sort_order\` - 1
             WHERE \`sort_order\` > ? AND \`sort_order\` <= ? AND \`id\` != ?`,
            [oldOrder, sort_order, id]
          );
        }
      }
    }

    values.push(id);

    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE \`couriers\` SET ${fields.join(", ")} WHERE \`id\` = ?`,
      values
    );

    if (result.affectedRows === 0) return error("Courier not found.");

    void logAdminAction(session.customerId, "update_courier", "couriers", id, null,
      JSON.stringify({ name, wm: wm_fee, em: em_fee, labuan: labuan_fee, is_active }));

    return success({ message: "Courier updated successfully." });
  } catch (e) {
    console.error("Admin couriers PUT error:", e);
    return error("Failed to update courier.", 500);
  }
}

// ── DELETE: Delete a courier ────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return error("Courier ID is required.");

    const safeId = safeInt(id, 0, 1);
    if (safeId <= 0) return error("Invalid courier ID.");

    // Block delete if courier is referenced by any orders
    const [usageRows] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS cnt FROM `orders` WHERE `courier_id` = ?",
      [safeId]
    );
    if ((usageRows[0]?.cnt ?? 0) > 0) {
      return error("Cannot delete courier — it is used by existing orders.", 409);
    }

    const [result] = await db.execute<ResultSetHeader>(
      "DELETE FROM `couriers` WHERE `id` = ?",
      [safeId]
    );

    if (result.affectedRows === 0) return error("Courier not found.");

    void logAdminAction(session.customerId, "delete_courier", "couriers", safeId);

    return success({ message: "Courier deleted successfully." });
  } catch (e) {
    console.error("Admin couriers DELETE error:", e);
    return error("Failed to delete courier.", 500);
  }
}
