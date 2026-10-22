import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { safeInt, paginate } from "@/lib/db-helpers";
import { requireAdmin, requireAdminCsrf, success, error } from "../_helpers";
import { adminReviewActionSchema, validate } from "@/lib/validation";
import { logAdminAction } from "@/lib/audit";
import { normalizeReviewPhotoPath, removeReviewPhotoFiles } from "@/lib/review-upload-path";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

// ── GET: List all reviews ───────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const url = new URL(request.url);
    const page = url.searchParams.get("page") ?? "1";
    const perPage = url.searchParams.get("perPage") ?? "20";
    const status = url.searchParams.get("status");
    const ratingValue = url.searchParams.get("rating")?.trim() ?? "";
    const search = url.searchParams.get("search")?.trim() ?? "";

    if (status && status !== "all" && !["pending", "approved", "rejected"].includes(status)) {
      return error("Invalid review status filter.", 400);
    }
    if (ratingValue && ratingValue !== "all" && !/^[1-5]$/.test(ratingValue)) {
      return error("Rating must be between 1 and 5.", 400);
    }
    if (search.length > 200) return error("Search must not exceed 200 characters.", 400);

    const { limit, offset } = paginate(page, perPage);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status && status !== "all") {
      conditions.push("r.`status` = ?");
      params.push(status);
    }
    if (ratingValue && ratingValue !== "all") {
      conditions.push("r.`rating` = ?");
      params.push(Number(ratingValue));
    }
    if (search) {
      conditions.push("(r.`review_text` LIKE ? ESCAPE '!' OR r.`display_name` LIKE ? ESCAPE '!' OR c.`name` LIKE ? ESCAPE '!' OR c.`email` LIKE ? ESCAPE '!' OR o.`order_ref` LIKE ? ESCAPE '!')");
      const like = `%${search.replace(/[!%_]/g, "!$&")}%`;
      params.push(like, like, like, like, like);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM \`reviews\` r
       LEFT JOIN \`orders\` o ON o.\`id\` = r.\`order_id\`
       LEFT JOIN \`customers\` c ON c.\`id\` = r.\`customer_id\`
       ${whereClause}`,
      params
    );
    const total = countRows[0]?.total ?? 0;

    const [reviews] = await db.query<RowDataPacket[]>(
      `SELECT
         r.\`id\`, r.\`customer_id\`, NULL AS product_id, r.\`order_id\`,
         r.\`rating\`, r.\`review_text\` AS comment, r.\`status\`, r.\`created_at\`,
         r.\`display_mode\`, r.\`display_name\`, o.\`order_ref\`,
         c.\`name\`  AS customer_name,
         c.\`email\` AS customer_email,
         'Eastel SIM (single-SIM order)' AS product_name
       FROM \`reviews\` r
       LEFT JOIN \`orders\` o ON o.\`id\` = r.\`order_id\`
       LEFT JOIN \`customers\` c ON c.\`id\` = r.\`customer_id\`
       ${whereClause}
       ORDER BY r.\`created_at\` DESC, r.\`id\` DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    // Fetch photos for all reviews in this batch
    const reviewIds = reviews.map((r: RowDataPacket) => r.id)
    const photosByReview: Record<number, { id: number; url: string }[]> = {}
    if (reviewIds.length > 0) {
      const placeholders = reviewIds.map(() => '?').join(',')
      const [allPhotos] = await db.query<RowDataPacket[]>(
        `SELECT id, review_id, file_path FROM review_photos WHERE review_id IN (${placeholders}) ORDER BY sort_order, id`,
        reviewIds
      )
      for (const p of allPhotos) {
        if (!photosByReview[p.review_id]) photosByReview[p.review_id] = []
        const photo = normalizeReviewPhotoPath(p.file_path)
        if (photo) photosByReview[p.review_id].push({ id: p.id, url: photo.url })
      }
    }

    const reviewsWithPhotos = reviews.map((r: RowDataPacket) => ({
      ...r,
      photos: photosByReview[r.id] || [],
    }))

    return success({
      reviews: reviewsWithPhotos,
      pagination: {
        total,
        page: safeInt(page, 1, 1),
        perPage: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error("Admin reviews GET error:", e);
    return error("Failed to load reviews.", 500);
  }
}

// ── POST: Approve, reject, or delete a review ──────────────

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const body = await request.json();

    const parsed = validate(adminReviewActionSchema, body);
    if (!parsed.success) {
      return error(parsed.errors?.["_form"] || Object.values(parsed.errors ?? {})[0] || "Validation failed.");
    }
    const { reviewId, action } = parsed.data;

    if (action === "delete") {
      const connection = await db.getConnection();
      let photoPaths: string[] = [];
      try {
        await connection.beginTransaction();
        const [reviewRows] = await connection.query<RowDataPacket[]>(
          "SELECT `id` FROM `reviews` WHERE `id` = ? LIMIT 1 FOR UPDATE", [reviewId]
        );
        if (reviewRows.length === 0) {
          await connection.rollback();
          return error("Review not found.", 404);
        }
        const [photoRows] = await connection.query<RowDataPacket[]>(
          "SELECT `file_path` FROM `review_photos` WHERE `review_id` = ?", [reviewId]
        );
        photoPaths = photoRows.map((row) => String(row.file_path ?? ""));
        await connection.execute("DELETE FROM `review_photos` WHERE `review_id` = ?", [reviewId]);
        const [result] = await connection.execute<ResultSetHeader>(
          "DELETE FROM `reviews` WHERE `id` = ?", [reviewId]
        );
        if (result.affectedRows === 0) {
          await connection.rollback();
          return error("Review not found.", 404);
        }
        await connection.commit();
      } catch (e) {
        await connection.rollback();
        throw e;
      } finally {
        connection.release();
      }
      const cleanupFailures = await removeReviewPhotoFiles(photoPaths);
      void logAdminAction(session.customerId, "delete_review", "reviews", reviewId);
      return success({
        message: cleanupFailures ? "Review deleted; one or more local photos could not be removed." : "Review deleted successfully.",
        cleanupWarning: cleanupFailures > 0,
      });
    }

    const newStatus = action === "approve" ? "approved" : action === "set_pending" ? "pending" : "rejected";
    const [result] = await db.execute<ResultSetHeader>(
      "UPDATE `reviews` SET `status` = ? WHERE `id` = ?",
      [newStatus, reviewId]
    );
    if (result.affectedRows === 0) return error("Review not found.", 404);
    void logAdminAction(session.customerId, `${action}_review`, "reviews", reviewId, null, newStatus);
    const message = action === "set_pending"
      ? "Review returned to pending."
      : `Review ${action}d successfully.`;
    return success({ message });
  } catch (e) {
    console.error("Admin reviews POST error:", e);
    return error("Failed to update review.", 500);
  }
}
