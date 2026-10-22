import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { safeInt } from "@/lib/db-helpers";
import { requireAdmin, requireAdminCsrf, success, error } from "../_helpers";
import { adminZoneSchema, validate } from "@/lib/validation";
import { logAdminAction } from "@/lib/audit";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

// ── GET: List all postcode zones ────────────────────────────

export async function GET() {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const [zones] = await db.query<RowDataPacket[]>(
      "SELECT * FROM `postcode_zones` ORDER BY `postcode_start` ASC"
    );

    return success({ zones });
  } catch (e) {
    console.error("Admin zones GET error:", e);
    return error("Failed to load zones.", 500);
  }
}

// ── POST: Create a new postcode zone ────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const body = await request.json();
    const parsed = validate(adminZoneSchema, body);
    if (!parsed.success) return error(Object.values(parsed.errors)[0] || "Invalid zone.");
    const { postcode_start, postcode_end, zone, description } = parsed.data;
    const [overlaps] = await db.query<RowDataPacket[]>(
      "SELECT id FROM postcode_zones WHERE postcode_start <= ? AND postcode_end >= ? LIMIT 1",
      [postcode_end, postcode_start]
    );
    if (overlaps.length > 0) return error("Postcode range overlaps an existing zone.", 409);

    const [result] = await db.execute<ResultSetHeader>(
      "INSERT INTO `postcode_zones` (`postcode_start`, `postcode_end`, `zone`, `description`) VALUES (?, ?, ?, ?)",
      [Number(postcode_start), Number(postcode_end), zone, description || null]
    );

    void logAdminAction(session.customerId, "add_postcode_zone", "postcode_zones", result.insertId, null,
      JSON.stringify({ start: postcode_start, end: postcode_end, zone }));

    return success({
      message: "Zone created successfully.",
      zoneId: result.insertId,
    });
  } catch (e) {
    console.error("Admin zones POST error:", e);
    return error("Failed to create zone.", 500);
  }
}

// ── PUT: Update an existing postcode zone ───────────────────

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const body = await request.json();
    if (!Number.isInteger(body.id) || body.id <= 0) return error("Invalid zone ID.");
    const safeId = body.id;
    const [existing] = await db.query<RowDataPacket[]>(
      "SELECT * FROM postcode_zones WHERE id = ? LIMIT 1", [safeId]
    );
    if (!existing.length) return error("Zone not found.", 404);
    const parsed = validate(adminZoneSchema, { ...existing[0], description: existing[0].description ?? '', ...body });
    if (!parsed.success) return error(Object.values(parsed.errors)[0] || "Invalid zone.");
    const { postcode_start, postcode_end, zone, description } = parsed.data;
    const [overlaps] = await db.query<RowDataPacket[]>(
      "SELECT id FROM postcode_zones WHERE postcode_start <= ? AND postcode_end >= ? AND id != ? LIMIT 1",
      [postcode_end, postcode_start, safeId]
    );
    if (overlaps.length > 0) return error("Postcode range overlaps an existing zone.", 409);
    const fields = ["postcode_start = ?", "postcode_end = ?", "zone = ?", "description = ?"];
    const values = [postcode_start, postcode_end, zone, description || null, safeId];

    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE \`postcode_zones\` SET ${fields.join(", ")} WHERE \`id\` = ?`,
      values
    );

    if (result.affectedRows === 0) return error("Zone not found.");

    void logAdminAction(session.customerId, "update_postcode_zone", "postcode_zones", safeId, null,
      JSON.stringify({ start: postcode_start, end: postcode_end, zone }));

    return success({ message: "Zone updated successfully." });
  } catch (e) {
    console.error("Admin zones PUT error:", e);
    return error("Failed to update zone.", 500);
  }
}

// ── DELETE: Delete a postcode zone ──────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return error("Zone ID is required.");

    const safeId = safeInt(id, 0, 1);
    if (safeId <= 0) return error("Invalid zone ID.");

    const [result] = await db.execute<ResultSetHeader>(
      "DELETE FROM `postcode_zones` WHERE `id` = ?",
      [safeId]
    );

    if (result.affectedRows === 0) return error("Zone not found.");

    void logAdminAction(session.customerId, "delete_postcode_zone", "postcode_zones", safeId);

    return success({ message: "Zone deleted successfully." });
  } catch (e) {
    console.error("Admin zones DELETE error:", e);
    return error("Failed to delete zone.", 500);
  }
}
