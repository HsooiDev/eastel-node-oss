// ─────────────────────────────────────────────────────────────
// Admin action audit trail — writes to the SAME `admin_audit_log`
// table the PHP site uses (shared DB, identical columns).
// PHP counterpart: logAdminAction() in api/config.php.
// Fire-and-forget: must never break the calling request.
// ─────────────────────────────────────────────────────────────

import db from '@/lib/db'

export async function logAdminAction(
  adminId: number | null,
  action: string,
  targetTable: string | null = null,
  targetId: number | null = null,
  oldValue: string | null = null,
  newValue: string | null = null,
  ip: string | null = null
): Promise<void> {
  try {
    await db.execute(
      `INSERT INTO admin_audit_log
         (admin_id, action, target_table, target_id, old_value, new_value, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [adminId, action, targetTable, targetId, oldValue, newValue, ip]
    )
  } catch (e) {
    console.error('[audit] logAdminAction failed:', e)
  }
}
