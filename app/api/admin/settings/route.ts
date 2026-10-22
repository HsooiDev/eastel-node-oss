import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { formatDate } from "@/lib/db-helpers";
import { requireAdmin, requireAdminCsrf, success, error } from "../_helpers";
import { settingsSchema, validate } from "@/lib/validation";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { isPlanRecommenderSettingKey } from "@/lib/plan-recommender-key";

// ── GET: List all settings ──────────────────────────────────

export async function GET() {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT * FROM `settings` ORDER BY `setting_key` ASC"
    );

    // The plan catalogue has a dedicated editor; keep it out of this generic
    // endpoint as well as out of the generic settings page.
    const visibleRows = rows.filter((row) => !isPlanRecommenderSettingKey(row.setting_key));

    // Convert rows to key-value object for convenience
    const settings: Record<string, string> = {};
    for (const row of visibleRows) {
      settings[row.setting_key] = row.setting_value;
    }

    return success({ settings, raw: visibleRows });
  } catch (e) {
    console.error("Admin settings GET error:", e);
    return error("Failed to load settings.", 500);
  }
}

// ── POST: Update settings (batch upsert) ───────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const body: unknown = await request.json();
    const rawSettings = body && typeof body === "object" && "settings" in body
      ? body.settings
      : undefined;

    // The catalogue has its own validated editor; never let raw/stale settings
    // overwrite the recommendations saved there.
    if (rawSettings && typeof rawSettings === "object"
      && Object.keys(rawSettings).some(isPlanRecommenderSettingKey)) {
      return error("Use the plan recommender editor to update the plan catalogue.");
    }

    const parsed = validate(settingsSchema, rawSettings ?? {});
    if (!parsed.success) {
      return error(parsed.errors?.["_form"] || Object.values(parsed.errors ?? {})[0] || "Settings validation failed.");
    }
    const settings = parsed.data;

    if (!settings || typeof settings !== "object" || Object.keys(settings).length === 0) {
      return error("Settings object is required.");
    }

    // Validate numeric setting values (fee, amount, rate, threshold keys must be non-negative numbers)
    for (const [key, value] of Object.entries(settings)) {
      if (key.endsWith("_fee") || key.endsWith("_amount") || key.endsWith("_rate") || key.endsWith("_threshold")) {
        const n = Number(value);
        if (isNaN(n) || n < 0) {
          return error(`Setting "${key}" must be a non-negative number.`);
        }
      }
    }

    const now = formatDate();
    let updatedCount = 0;
    const { logAdminAction } = await import("@/lib/audit");

    for (const [key, value] of Object.entries(settings)) {
      await db.execute<ResultSetHeader>(
        `INSERT INTO \`settings\` (\`setting_key\`, \`setting_value\`, \`updated_at\`)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE \`setting_value\` = VALUES(\`setting_value\`), \`updated_at\` = VALUES(\`updated_at\`)`,
        [key, String(value ?? ""), now]
      );
      updatedCount++;
    }

    void logAdminAction(session.customerId, "update_settings", "settings", null, null,
      JSON.stringify(Object.keys(settings)));

    return success({
      message: "Settings updated successfully.",
      updated: updatedCount,
    });
  } catch (e) {
    console.error("Admin settings POST error:", e);
    return error("Failed to update settings.", 500);
  }
}
