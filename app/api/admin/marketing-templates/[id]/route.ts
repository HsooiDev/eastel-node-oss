import { NextRequest } from "next/server";
import { requireAdmin, requireAdminCsrf, success, error } from "../../_helpers";
import db from "@/lib/db";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { safeInt } from "@/lib/db-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const { id } = await params;
    const safeId = safeInt(id, 0, 1);

    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT * FROM `marketing_templates` WHERE `id` = ?",
      [safeId]
    );

    if (rows.length === 0) return error("Template not found", 404);

    return success({ template: rows[0] });
  } catch (e) {
    console.error("Marketing templates GET error:", e);
    return error("Failed to load template.", 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const { id } = await params;
    const safeId = safeInt(id, 0, 1);

    const body = await request.json();
    const { template_name, layout_json, preview_image_url } = body;

    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE \`marketing_templates\` 
       SET \`template_name\` = ?, \`layout_json\` = ?, \`preview_image_url\` = COALESCE(?, \`preview_image_url\`)
       WHERE \`id\` = ?`,
      [template_name, JSON.stringify(layout_json), preview_image_url || null, safeId]
    );

    if (result.affectedRows === 0) return error("Template not found", 404);

    return success({ message: "Template updated successfully" });
  } catch (e) {
    console.error("Marketing templates PUT error:", e);
    return error("Failed to update template.", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const { id } = await params;
    const safeId = safeInt(id, 0, 1);

    const [result] = await db.execute<ResultSetHeader>(
      "DELETE FROM `marketing_templates` WHERE `id` = ?",
      [safeId]
    );

    if (result.affectedRows === 0) return error("Template not found", 404);

    return success({ message: "Template deleted successfully" });
  } catch (e) {
    console.error("Marketing templates DELETE error:", e);
    return error("Failed to delete template.", 500);
  }
}
