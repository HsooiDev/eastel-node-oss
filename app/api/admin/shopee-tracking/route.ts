import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { requireAdmin, requireAdminCsrf, success, error } from "../_helpers";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "get_shopee_orders";

    if (action === "get_shopee_orders") {
      const [rows] = await db.query<RowDataPacket[]>(
        "SELECT id, tracking_number, shopee_order_id, status, notes, tracking_data, created_at, updated_at FROM shopee_orders ORDER BY created_at DESC"
      );
      return success({ orders: rows });
    }

    return error("Invalid action.");
  } catch (e) {
    console.error("Shopee Tracking GET error:", e);
    return error("Failed to load Shopee orders.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminCsrf(request);
    if (!session) return error("Not authenticated.", 401);

    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case "add_shopee_order": {
        const tracking_number = String(data.tracking_number || "").trim().toUpperCase();
        const shopee_order_id = String(data.shopee_order_id || "").trim();
        const status = String(data.status || "pending").trim();
        const notes = String(data.notes || "").trim();

        if (!tracking_number) return error("tracking_number is required.");

        const [dup] = await db.query<RowDataPacket[]>(
          "SELECT id FROM shopee_orders WHERE tracking_number = ? LIMIT 1",
          [tracking_number]
        );
        if (dup.length > 0) return error("Tracking number already exists.", 409);

        const [result] = await db.execute<ResultSetHeader>(
          "INSERT INTO shopee_orders (tracking_number, shopee_order_id, status, notes) VALUES (?, ?, ?, ?)",
          [tracking_number, shopee_order_id || null, status, notes || null]
        );

        {
          const { logAdminAction } = await import("@/lib/audit");
          void logAdminAction(session.customerId, "add_shopee_order", "shopee_orders", result.insertId, null,
            JSON.stringify({ tracking: tracking_number, order_id: shopee_order_id }));
        }
        return success({ message: "Order added.", id: result.insertId });
      }

      case "update_shopee_order": {
        const id = Number(data.id || 0);
        const shopee_order_id = String(data.shopee_order_id || "").trim();
        const status = String(data.status || "").trim();
        const notes = String(data.notes || "").trim();

        const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled"];
        if (!id || !validStatuses.includes(status)) {
          return error("id and valid status are required.");
        }

        const [result] = await db.execute<ResultSetHeader>(
          "UPDATE shopee_orders SET shopee_order_id = ?, status = ?, notes = ?, updated_at = NOW() WHERE id = ?",
          [shopee_order_id || null, status, notes || null, id]
        );

        if (result.affectedRows === 0) return error("Order not found.", 404);
        {
          const { logAdminAction } = await import("@/lib/audit");
          void logAdminAction(session.customerId, "update_shopee_order", "shopee_orders", id, null,
            JSON.stringify({ status }));
        }
        return success({ message: "Order updated." });
      }

      case "delete_shopee_order": {
        const id = Number(data.id || 0);
        if (!id) return error("id is required.");

        const [result] = await db.execute<ResultSetHeader>(
          "DELETE FROM shopee_orders WHERE id = ?",
          [id]
        );

        if (result.affectedRows === 0) return error("Order not found.", 404);
        {
          const { logAdminAction } = await import("@/lib/audit");
          void logAdminAction(session.customerId, "delete_shopee_order", "shopee_orders", id);
        }
        return success({ message: "Order deleted." });
      }

      case "fetch_shopee_tracking": {
        const id = Number(data.id || 0);
        const tracking_number = String(data.tracking_number || "").trim().toUpperCase();

        if (!id || !tracking_number) {
          return error("id and tracking_number are required.");
        }

        let events: Array<{ desc: string; time: string }> = [];
        let new_status: string | null = null;
        let fetchError = "";

        try {
          const spxUrl = `https://spx.com.my/shipment/order/open/order/get_order_info?spx_tn=${encodeURIComponent(tracking_number)}&language_code=en`;
          const spxRes = await fetch(spxUrl, {
            headers: {
              "Accept": "application/json, text/plain, */*",
              "Referer": `https://spx.com.my/track?${tracking_number}`,
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            signal: AbortSignal.timeout(12_000),
            next: { revalidate: 0 },
          });

          if (spxRes.ok) {
            const resData = await spxRes.json();
            if (resData && resData.retcode === 0 && resData.data?.sls_tracking_info?.records) {
              const records = resData.data.sls_tracking_info.records;
              for (const rec of records) {
                const desc = rec.buyer_description || rec.description || rec.tracking_name || "Status Update";
                let time = "";
                if (rec.actual_time) {
                  const actualTime = rec.actual_time > 99999999999 ? Math.round(rec.actual_time / 1000) : rec.actual_time;
                  time = new Date(actualTime * 1000).toLocaleString("zh-CN", {
                    hour12: false,
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kuala_Lumpur",
                  }).replace(/\//g, "-");
                } else {
                  time = new Date().toLocaleString("zh-CN", {
                    hour12: false,
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kuala_Lumpur",
                  }).replace(/\//g, "-");
                }
                events.push({ desc, time });
              }

              if (records.length > 0) {
                const latest = records[0];
                const latest_desc = String(latest.buyer_description || latest.description || latest.tracking_name || "").toLowerCase();
                const milestone = String(latest.milestone_name || "").toLowerCase();

                if (latest_desc.includes("delivered") || latest_desc.includes("dihantar") || latest_desc.includes("collected") || latest_desc.includes("dikutip") || milestone === "delivered") {
                  new_status = "delivered";
                } else if (latest_desc.includes("collection point") || latest_desc.includes("ready for collection") || latest_desc.includes("point kutipan") || latest_desc.includes("self collection")) {
                  new_status = "shipped";
                } else if (latest_desc.includes("out for delivery") || latest_desc.includes("sedang dihantar") || milestone === "out for delivery") {
                  new_status = "shipped";
                } else if (latest_desc.includes("transit") || latest_desc.includes("transporting") || latest_desc.includes("dalam perjalanan") || milestone === "in transit") {
                  new_status = "shipped";
                } else if (latest_desc.includes("received") || latest_desc.includes("packed") || latest_desc.includes("picked up") || milestone === "picked up" || milestone === "parcel received") {
                  new_status = "processing";
                } else if (latest_desc.includes("cancelled") || latest_desc.includes("batal") || latest_desc.includes("returned") || milestone === "cancelled") {
                  new_status = "cancelled";
                } else {
                  if (milestone === "delivered") new_status = "delivered";
                  else if (milestone === "in transit" || milestone === "out for delivery") new_status = "shipped";
                  else if (milestone === "picked up" || milestone === "parcel received") new_status = "processing";
                }
              }
            } else {
              fetchError = resData?.retcode !== 0 ? "Tracking number not found in SPX Express system yet." : "SPX Express returned invalid response.";
            }
          } else {
            fetchError = `Could not reach SPX Express website. HTTP ${spxRes.status}`;
          }
        } catch (e: any) {
          fetchError = `SPX fetch error: ${e.message}`;
        }

        // DB existing tracking check
        let existingTracking: any[] = [];
        try {
          const [rows] = await db.query<RowDataPacket[]>(
            "SELECT tracking_data FROM shopee_orders WHERE id = ? LIMIT 1",
            [id]
          );
          if (rows[0]?.tracking_data) {
            existingTracking = JSON.parse(rows[0].tracking_data);
          }
        } catch {}

        // Fallback to EasyParcel track
        if (events.length === 0 && !new_status) {
          try {
            const epUrl = `https://app.easyparcel.com/tools/easytrack/summary/?awb=${encodeURIComponent(tracking_number)}`;
            const epRes = await fetch(epUrl, { signal: AbortSignal.timeout(6000) });
            if (epRes.ok) {
              const html2 = await epRes.text();
              const lower2 = html2.toLowerCase();
              const formattedTime = new Date().toLocaleString("zh-CN", {
                hour12: false,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Kuala_Lumpur",
              }).replace(/\//g, "-");

              if (lower2.includes("delivered")) {
                new_status = "delivered";
                events.push({ desc: "Parcel Delivered (via EasyParcel)", time: formattedTime });
              } else if (lower2.includes("out for delivery")) {
                new_status = "shipped";
                events.push({ desc: "Out for Delivery (via EasyParcel)", time: formattedTime });
              } else if (lower2.includes("transit") || lower2.includes("arrived")) {
                new_status = "shipped";
                events.push({ desc: "In Transit (via EasyParcel)", time: formattedTime });
              }
            }
          } catch {}
        }

        if (events.length === 0 && new_status && existingTracking.length > 0) {
          events = existingTracking;
          const statusLabel = new_status.charAt(0).toUpperCase() + new_status.slice(1);
          const formattedTime = new Date().toLocaleString("zh-CN", {
            hour12: false,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Kuala_Lumpur",
          }).replace(/\//g, "-");
          events.unshift({
            desc: `Status updated to ${statusLabel} (via EasyParcel fallback)`,
            time: formattedTime,
          });
        }

        const trackingJson = events.length > 0 ? JSON.stringify(events) : null;
        if (new_status) {
          await db.execute(
            "UPDATE shopee_orders SET status = ?, tracking_data = ?, updated_at = NOW() WHERE id = ?",
            [new_status, trackingJson, id]
          );
        } else if (trackingJson) {
          await db.execute(
            "UPDATE shopee_orders SET tracking_data = ?, updated_at = NOW() WHERE id = ?",
            [trackingJson, id]
          );
        }

        if (events.length === 0 && !new_status) {
          return error(fetchError || "No tracking info found. SPX may be blocking automated requests.");
        }

        return success({
          order_status: new_status,
          tracking_data: trackingJson,
          events,
        });
      }

      default:
        return error("Invalid action.");
    }
  } catch (e) {
    console.error("Shopee Tracking POST error:", e);
    return error("Operation failed.", 500);
  }
}
