export type AdminOrderFilters = {
  status: string;
  paymentStatus: string;
  source: string;
  search: string;
  startDate: string;
  endDate: string;
};

export type ParseAdminOrderFiltersResult =
  | { ok: true; filters: AdminOrderFilters }
  | { ok: false; message: string };

const ORDER_STATUSES = new Set(["pending", "processing", "shipped", "delivered", "cancelled"]);
const PAYMENT_STATUSES = new Set(["pending", "paid", "failed"]);
const ORDER_SOURCES = new Set(["website", "whatsapp"]);

function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12) return false;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

export function parseAdminOrderFilters(params: URLSearchParams): ParseAdminOrderFiltersResult {
  const status = params.get("status")?.trim() ?? "";
  const paymentStatus = params.get("paymentStatus")?.trim() ?? "";
  const source = params.get("source")?.trim() ?? "";
  const search = params.get("search")?.trim() ?? "";
  const startDate = params.get("startDate")?.trim() ?? "";
  const endDate = params.get("endDate")?.trim() ?? "";

  if (status && status !== "all" && !ORDER_STATUSES.has(status)) {
    return { ok: false, message: "Invalid order status filter." };
  }
  if (paymentStatus && paymentStatus !== "all" && !PAYMENT_STATUSES.has(paymentStatus)) {
    return { ok: false, message: "Invalid payment status filter." };
  }
  if (source && source !== "all" && !ORDER_SOURCES.has(source)) {
    return { ok: false, message: "Invalid source filter." };
  }
  if (search.length > 200) {
    return { ok: false, message: "Search must not exceed 200 characters." };
  }
  if (startDate && !isRealIsoDate(startDate)) {
    return { ok: false, message: "Start date must be a real date in YYYY-MM-DD format." };
  }
  if (endDate && !isRealIsoDate(endDate)) {
    return { ok: false, message: "End date must be a real date in YYYY-MM-DD format." };
  }
  if (startDate && endDate && startDate > endDate) {
    return { ok: false, message: "Start date must be on or before end date." };
  }

  return {
    ok: true,
    filters: {
      status: status === "all" ? "" : status,
      paymentStatus: paymentStatus === "all" ? "" : paymentStatus,
      source: source === "all" ? "" : source,
      search,
      startDate,
      endDate,
    },
  };
}

export function buildAdminOrderWhere(filters: AdminOrderFilters) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    conditions.push("o.`order_status` = ?");
    params.push(filters.status);
  }
  if (filters.paymentStatus) {
    conditions.push("o.`payment_status` = ?");
    params.push(filters.paymentStatus);
  }
  if (filters.source) {
    conditions.push("COALESCE(o.`source`, 'website') = ?");
    params.push(filters.source);
  }
  if (filters.startDate) {
    conditions.push("o.`created_at` >= ?");
    params.push(`${filters.startDate} 00:00:00`);
  }
  if (filters.endDate) {
    conditions.push("o.`created_at` <= ?");
    params.push(`${filters.endDate} 23:59:59.999999`);
  }
  if (filters.search) {
    conditions.push(
      "(o.`order_ref` LIKE ? ESCAPE '!' OR o.`full_name` LIKE ? ESCAPE '!' OR o.`email` LIKE ? ESCAPE '!' OR o.`phone` LIKE ? ESCAPE '!' OR o.`delivery_address` LIKE ? ESCAPE '!' OR o.`postcode` LIKE ? ESCAPE '!' OR c.`name` LIKE ? ESCAPE '!' OR c.`email` LIKE ? ESCAPE '!' OR c.`phone` LIKE ? ESCAPE '!')"
    );
    const literalSearch = filters.search.replace(/[!%_]/g, "!$&");
    const like = `%${literalSearch}%`;
    params.push(like, like, like, like, like, like, like, like, like);
  }

  return {
    whereClause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}
