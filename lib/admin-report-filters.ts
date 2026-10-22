export interface AdminReportDateRange {
  startDate: string;
  endDate: string;
}

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12) return false;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= lastDay;
}

export function parseAdminReportDateRange(params: URLSearchParams):
  | { ok: true; range: AdminReportDateRange }
  | { ok: false; message: string } {
  const startDate = params.get("startDate")?.trim() ?? "";
  const endDate = params.get("endDate")?.trim() ?? "";
  if (startDate && !isRealDate(startDate)) {
    return { ok: false, message: "Start date must be a real date in YYYY-MM-DD format." };
  }
  if (endDate && !isRealDate(endDate)) {
    return { ok: false, message: "End date must be a real date in YYYY-MM-DD format." };
  }
  if (startDate && endDate && startDate > endDate) {
    return { ok: false, message: "Start date must be on or before end date." };
  }
  return { ok: true, range: { startDate, endDate } };
}

export function reportDateWhere(column: string, range: AdminReportDateRange) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (range.startDate) {
    conditions.push(`${column} >= ?`);
    params.push(`${range.startDate} 00:00:00`);
  }
  if (range.endDate) {
    conditions.push(`${column} <= ?`);
    params.push(`${range.endDate} 23:59:59.999999`);
  }
  return { conditions, params };
}
