import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { safeInt, paginate, formatDate } from "@/lib/db-helpers";
import { requireAdmin, requireAdminCsrf, success, error } from "../_helpers";
import { adminProductSchema, adminProductUpdateSchema, validate } from "@/lib/validation";
import { logAdminAction } from "@/lib/audit";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

// ── GET: List all products ──────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const url = new URL(request.url);
    const page = url.searchParams.get("page") ?? "1";
    const perPage = url.searchParams.get("perPage") ?? "50";
    const search = url.searchParams.get("search");

    const { limit, offset } = paginate(page, perPage);

    let whereClause = "";
    const params: unknown[] = [];

    if (search && search.trim().length > 0) {
      whereClause = "WHERE `name` LIKE ?";
      params.push(`%${search.trim()}%`);
    }

    const [countRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM \`products\` ${whereClause}`,
      params
    );
    const total = countRows[0]?.total ?? 0;

    const [products] = await db.query<RowDataPacket[]>(
      `SELECT * FROM \`products\` ${whereClause} ORDER BY \`sort_order\` ASC, \`id\` DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return success({
      products,
      pagination: {
        total,
        page: safeInt(page, 1, 1),
        perPage: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error("Admin products GET error:", e);
    return error("Failed to load products.", 500);
  }
}

// ── POST: Create a new product ──────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const body = await request.json();

    const parsed = validate(adminProductSchema, body);
    if (!parsed.success) {
      return error(parsed.errors?.["_form"] || Object.values(parsed.errors ?? {})[0] || "Validation failed.");
    }
    const { name, description, price, weight_g, stock, is_active, sort_order, image_url } = parsed.data;

    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO \`products\`
        (\`name\`, \`description\`, \`price\`, \`weight_g\`, \`stock\`,
         \`is_active\`, \`sort_order\`, \`image_url\`, \`created_at\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || null,
        price,
        weight_g,
        stock,
        is_active,
        sort_order,
        image_url || null,
        formatDate(),
      ]
    );

    void logAdminAction(session.customerId, "add_product", "products", result.insertId, null,
      JSON.stringify({ name, price, stock }));

    return success({
      message: "Product created successfully.",
      productId: result.insertId,
    });
  } catch (e) {
    console.error("Admin products POST error:", e);
    return error("Failed to create product.", 500);
  }
}

// ── PUT: Update an existing product ─────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const body = await request.json();

    const parsed = validate(adminProductUpdateSchema, body);
    if (!parsed.success) {
      return error(parsed.errors?.["_form"] || Object.values(parsed.errors ?? {})[0] || "Validation failed.");
    }
    const { id, name, description, price, weight_g, stock, is_active, sort_order, image_url } = parsed.data;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) { fields.push("`name` = ?"); values.push(name); }
    if (description !== undefined) { fields.push("`description` = ?"); values.push(description || null); }
    if (price !== undefined) { fields.push("`price` = ?"); values.push(price); }
    if (weight_g !== undefined) { fields.push("`weight_g` = ?"); values.push(weight_g); }
    if (stock !== undefined) { fields.push("`stock` = ?"); values.push(stock); }
    if (is_active !== undefined) { fields.push("`is_active` = ?"); values.push(is_active); }
    if (sort_order !== undefined) { fields.push("`sort_order` = ?"); values.push(sort_order); }
    if (image_url !== undefined) { fields.push("`image_url` = ?"); values.push(image_url || null); }

    if (fields.length === 0) return error("No fields to update.");

    values.push(id);

    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE \`products\` SET ${fields.join(", ")} WHERE \`id\` = ?`,
      values
    );

    if (result.affectedRows === 0) return error("Product not found.");

    void logAdminAction(session.customerId, "update_product", "products", id, null,
      JSON.stringify({ name, price, stock, is_active }));

    return success({ message: "Product updated successfully." });
  } catch (e) {
    console.error("Admin products PUT error:", e);
    return error("Failed to update product.", 500);
  }
}

// ── DELETE: Delete a product ────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return error("Product ID is required.");

    const safeId = safeInt(id, 0, 1);
    if (safeId <= 0) return error("Invalid product ID.");

    const [result] = await db.execute<ResultSetHeader>(
      "DELETE FROM `products` WHERE `id` = ?",
      [safeId]
    );

    if (result.affectedRows === 0) return error("Product not found.");

    void logAdminAction(session.customerId, "delete_product", "products", safeId);

    return success({ message: "Product deleted successfully." });
  } catch (e) {
    console.error("Admin products DELETE error:", e);
    return error("Failed to delete product.", 500);
  }
}
