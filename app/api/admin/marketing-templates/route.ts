import { NextRequest } from "next/server";
import { requireAdmin, requireAdminCsrf, success, error } from "../_helpers";
import db from "@/lib/db";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

export async function GET() {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const [templates] = await db.query<RowDataPacket[]>(
      `SELECT \`id\`, \`template_name\`, \`preview_image_url\`, \`layout_json\`, \`created_at\`, \`updated_at\`
       FROM \`marketing_templates\` 
       ORDER BY \`updated_at\` DESC`
    );

    const decodedTemplates = templates.map((template) => {
      let layout = template.layout_json;
      if (typeof layout === "string") {
        try {
          layout = JSON.parse(layout) as unknown;
        } catch {
          layout = null;
        }
      }
      return { ...template, layout_json: layout };
    });

    return success({ templates: decodedTemplates });
  } catch (e) {
    console.error("Marketing templates GET error:", e);
    return error("Failed to load templates.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const body = await request.json();
    const { template_name, layout_json, preview_image_url } = body;

    if (!template_name || !layout_json) {
      return error("Template name and layout data are required.");
    }

    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO \`marketing_templates\` (\`template_name\`, \`layout_json\`, \`preview_image_url\`)
       VALUES (?, ?, ?)`,
      [template_name, JSON.stringify(layout_json), preview_image_url || null]
    );

    return success({
      message: "Template saved successfully",
      id: result.insertId
    });
  } catch (e) {
    console.error("Marketing templates POST error:", e);
    return error("Failed to save template.", 500);
  }
}
