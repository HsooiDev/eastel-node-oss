// ─────────────────────────────────────────────────────────────
// Database Migration Runner
// Centralized schema management. All tables created here.
// Idempotent — safe to call multiple times.
// ─────────────────────────────────────────────────────────────

import { execute, query } from '@/lib/db'

let migrated = false
let orderPlanMigration: Promise<void> | null = null

async function addColumn(table: string, column: string, definition: string): Promise<void> {
  try {
    await execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`)
  } catch (error: any) {
    if (error.code !== 'ER_DUP_FIELDNAME' && error.errno !== 1060) {
      throw error
    }
  }
}

/** Narrow additive migration for order writes; no unrelated tables or old orders change. */
export async function ensureOrderPlanColumns(): Promise<void> {
  if (!orderPlanMigration) {
    orderPlanMigration = (async () => {
      await addColumn('orders', 'plan_snapshot', 'LONGTEXT DEFAULT NULL')
      await addColumn('orders', 'plan_fee', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00')
      await addColumn('orders', 'plan_fulfilled_at', 'DATETIME DEFAULT NULL')
      await addColumn('orders', 'plan_fulfilled_by', 'INT DEFAULT NULL')
    })().catch(error => {
      orderPlanMigration = null
      throw error
    })
  }
  await orderPlanMigration
}

export async function ensureAllTables(): Promise<void> {
  if (migrated) return

  await ensureCoreTables()
  await ensureWhatsAppTables()
  await ensureTelegramTables()
  await ensureMarketingTables()
  await ensureShopeeTrackingTables()
  await ensureVoucherTables()

  migrated = true
}

// ── Marketing Design Studio ──────────────────────────────────

async function ensureMarketingTables(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS \`marketing_templates\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`template_name\` VARCHAR(255) NOT NULL,
      \`layout_json\` LONGTEXT NOT NULL,
      \`preview_image_url\` VARCHAR(500) DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`ai_daily_usage\` (
      \`date\` DATE NOT NULL,
      \`ai_provider\` VARCHAR(50) NOT NULL DEFAULT 'gemini',
      \`ai_model\` VARCHAR(100) NOT NULL,
      \`count\` INT NOT NULL DEFAULT 0,
      \`daily_limit\` INT DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`date\`, \`ai_model\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

// ── Core Tables ──────────────────────────────────────────────

async function ensureCoreTables(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS \`admin_users\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`name\` VARCHAR(100) NOT NULL,
      \`email\` VARCHAR(255) NOT NULL,
      \`password_hash\` VARCHAR(255) NOT NULL,
      \`is_active\` TINYINT(1) DEFAULT 1,
      \`last_login\` TIMESTAMP NULL DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`email\` (\`email\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`couriers\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`name\` VARCHAR(100) NOT NULL,
      \`tracking_url\` VARCHAR(500) DEFAULT NULL,
      \`wm_fee\` DECIMAL(10,2) NOT NULL,
      \`em_fee\` DECIMAL(10,2) NOT NULL,
      \`labuan_fee\` DECIMAL(10,2) NOT NULL,
      \`is_active\` TINYINT(1) DEFAULT 1,
      \`sort_order\` INT DEFAULT 0,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`customers\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`name\` VARCHAR(255) NOT NULL,
      \`email\` VARCHAR(255) NOT NULL,
      \`phone\` VARCHAR(20) NOT NULL,
      \`password_hash\` VARCHAR(255) NOT NULL,
      \`is_temp_pass\` TINYINT(1) DEFAULT 1,
      \`address\` TEXT DEFAULT NULL,
      \`postcode\` VARCHAR(10) DEFAULT NULL,
      \`state\` VARCHAR(100) DEFAULT NULL,
      \`reset_token\` VARCHAR(255) DEFAULT NULL,
      \`reset_expires\` DATETIME DEFAULT NULL,
      \`email_verified\` TINYINT(1) DEFAULT 0,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`email\` (\`email\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`orders\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`order_ref\` VARCHAR(50) NOT NULL,
      \`customer_id\` INT DEFAULT NULL,
      \`product_id\` INT NOT NULL DEFAULT 1,
      \`courier_id\` INT DEFAULT NULL,
      \`quantity\` INT NOT NULL DEFAULT 1,
      \`unit_price\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`delivery_fee\` DECIMAL(10,2) NOT NULL,
      \`total_amount\` DECIMAL(10,2) NOT NULL,
      \`payment_status\` ENUM('pending','paid','failed') DEFAULT 'pending',
      \`order_status\` ENUM('pending','processing','shipped','delivered','cancelled') DEFAULT 'pending',
      \`tracking_number\` VARCHAR(100) DEFAULT NULL,
      \`bill_code\` VARCHAR(100) DEFAULT NULL,
      \`full_name\` VARCHAR(255) NOT NULL,
      \`phone\` VARCHAR(20) NOT NULL,
      \`delivery_address\` TEXT NOT NULL,
      \`postcode\` VARCHAR(10) NOT NULL,
      \`state\` VARCHAR(100) NOT NULL,
      \`zone\` ENUM('WM','EM','Labuan') NOT NULL,
      \`courier_name\` VARCHAR(100) DEFAULT NULL,
      \`lang\` VARCHAR(5) DEFAULT 'en',
      \`email_sent\` TINYINT(1) DEFAULT 0,
      \`toyyibpay_ref\` VARCHAR(100) DEFAULT NULL,
      \`notes\` TEXT DEFAULT NULL,
      \`source\` VARCHAR(20) DEFAULT 'website',
      \`email\` VARCHAR(255) DEFAULT NULL,
      \`alt_phone\` VARCHAR(20) DEFAULT NULL,
      \`address_line1\` VARCHAR(255) DEFAULT NULL,
      \`address_line2\` VARCHAR(255) DEFAULT NULL,
      \`city\` VARCHAR(100) DEFAULT NULL,
      \`country\` VARCHAR(100) NOT NULL DEFAULT 'Malaysia',
      \`sim_fee\` DECIMAL(10,2) NOT NULL DEFAULT 10.00,
      \`voucher_code\` VARCHAR(40) DEFAULT NULL,
      \`voucher_discount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`plan_snapshot\` LONGTEXT DEFAULT NULL,
      \`plan_fee\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`plan_fulfilled_at\` DATETIME DEFAULT NULL,
      \`plan_fulfilled_by\` INT DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`order_ref\` (\`order_ref\`),
      INDEX \`idx_customer_id\` (\`customer_id\`),
      INDEX \`idx_courier_id\` (\`courier_id\`),
      INDEX \`idx_bill_code\` (\`bill_code\`),
      INDEX \`idx_payment_status\` (\`payment_status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // The older Node initializer added unit_price without a default, although
  // PHP-compatible checkout writes sim_fee. Repair that unused legacy default
  // only where the column already exists; the PHP layout has no unit_price.
  const [legacyPriceColumns] = await query(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
      AND COLUMN_NAME = 'unit_price' AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT IS NULL
  `)
  if (legacyPriceColumns.length > 0) {
    await execute('ALTER TABLE `orders` ALTER COLUMN `unit_price` SET DEFAULT 0.00')
  }

  await execute(`
    CREATE TABLE IF NOT EXISTS \`products\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`name\` VARCHAR(150) NOT NULL,
      \`price\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`description\` TEXT DEFAULT NULL,
      \`weight_g\` INT NOT NULL DEFAULT 0,
      \`stock\` INT NOT NULL DEFAULT -1,
      \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
      \`sort_order\` INT NOT NULL DEFAULT 0,
      \`image_url\` VARCHAR(500) DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_active\` (\`is_active\`),
      INDEX \`idx_sort\` (\`sort_order\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`reviews\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`customer_id\` INT NOT NULL,
      \`product_id\` INT NOT NULL,
      \`order_id\` INT NOT NULL,
      \`rating\` TINYINT UNSIGNED NOT NULL,
      \`comment\` TEXT DEFAULT NULL,
      \`status\` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_customer_id\` (\`customer_id\`),
      INDEX \`idx_order_id\` (\`order_id\`),
      INDEX \`idx_status\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`postcode_zones\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`postcode_start\` INT NOT NULL,
      \`postcode_end\` INT NOT NULL,
      \`zone\` ENUM('WM','EM','Labuan') NOT NULL,
      \`description\` VARCHAR(100) DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`settings\` (
      \`setting_key\` VARCHAR(100) NOT NULL PRIMARY KEY,
      \`setting_value\` TEXT NOT NULL,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`payment_settings\` (
      \`key\` VARCHAR(100) NOT NULL PRIMARY KEY,
      \`value\` TEXT NOT NULL,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`turnstile_logs\` (
      \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`action\` VARCHAR(64) NOT NULL DEFAULT '',
      \`passed\` TINYINT(1) NOT NULL DEFAULT 0,
      \`ip\` VARCHAR(45) NOT NULL DEFAULT '',
      \`user_agent\` VARCHAR(512) NOT NULL DEFAULT '',
      INDEX \`idx_created\` (\`created_at\`),
      INDEX \`idx_action\` (\`action\`),
      INDEX \`idx_passed\` (\`passed\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`login_attempts\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`ip_address\` VARCHAR(45) NOT NULL,
      \`email\` VARCHAR(254) NOT NULL,
      \`success\` TINYINT(1) DEFAULT 0,
      \`user_agent\` TEXT DEFAULT NULL,
      \`attempted_at\` DATETIME NOT NULL,
      \`location\` VARCHAR(255) DEFAULT NULL,
      \`isp\` VARCHAR(255) DEFAULT NULL,
      \`password_tried\` VARCHAR(255) DEFAULT NULL,
      \`attempt_type\` VARCHAR(50) DEFAULT 'WRONG_PASSWORD',
      \`referer\` TEXT DEFAULT NULL,
      \`browser_lang\` VARCHAR(100) DEFAULT NULL,
      INDEX \`idx_email\` (\`email\`),
      INDEX \`idx_ip\` (\`ip_address\`),
      INDEX \`idx_attempted\` (\`attempted_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`review_photos\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`review_id\` INT NOT NULL,
      \`photo_path\` VARCHAR(500) NOT NULL,
      INDEX \`idx_review_id\` (\`review_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`sessions\` (
      \`id\` VARCHAR(64) PRIMARY KEY,
      \`customer_id\` INT NOT NULL,
      \`role\` VARCHAR(20) NOT NULL DEFAULT 'customer',
      \`ip_address\` VARCHAR(45),
      \`user_agent\` TEXT,
      \`expires_at\` DATETIME NOT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_customer\` (\`customer_id\`),
      INDEX \`idx_expires\` (\`expires_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`email_verifications\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`email\` VARCHAR(180) NOT NULL,
      \`code\` VARCHAR(6) NOT NULL,
      \`token\` VARCHAR(64) NOT NULL,
      \`verified\` TINYINT(1) DEFAULT 0,
      \`expires_at\` DATETIME NOT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_email\` (\`email\`),
      INDEX \`idx_token\` (\`token\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`postcode_inquiries\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`session_id\` VARCHAR(36) NOT NULL,
      \`postcode\` VARCHAR(10) NOT NULL,
      \`full_name\` VARCHAR(150) DEFAULT NULL,
      \`email\` VARCHAR(180) DEFAULT NULL,
      \`phone\` VARCHAR(30) DEFAULT NULL,
      \`alt_phone\` VARCHAR(30) DEFAULT NULL,
      \`address_line1\` VARCHAR(255) DEFAULT NULL,
      \`address_line2\` VARCHAR(255) DEFAULT NULL,
      \`city\` VARCHAR(100) DEFAULT NULL,
      \`state\` VARCHAR(100) DEFAULT NULL,
      \`status\` ENUM('new','contacted','resolved','no_action') NOT NULL DEFAULT 'new',
      \`wa_opened\` TINYINT(1) NOT NULL DEFAULT 0,
      \`ip_address\` VARCHAR(45) DEFAULT NULL,
      \`admin_notes\` TEXT DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_session_id\` (\`session_id\`),
      INDEX \`idx_postcode\` (\`postcode\`),
      INDEX \`idx_status\` (\`status\`),
      INDEX \`idx_created_at\` (\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // Admin action audit trail — SAME table the PHP site writes (api/config.php logAdminAction)
  await execute(`
    CREATE TABLE IF NOT EXISTS \`admin_audit_log\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`admin_id\` INT DEFAULT NULL,
      \`action\` VARCHAR(100) NOT NULL,
      \`target_table\` VARCHAR(50) DEFAULT NULL,
      \`target_id\` INT DEFAULT NULL,
      \`old_value\` TEXT DEFAULT NULL,
      \`new_value\` TEXT DEFAULT NULL,
      \`ip_address\` VARCHAR(45) DEFAULT NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_audit_created\` (\`created_at\`),
      INDEX \`idx_audit_action\` (\`action\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // Run dynamic safe ALTER TABLE migrations for existing tables
  await addColumn('orders', 'email_sent', 'TINYINT(1) DEFAULT 0')
  await addColumn('orders', 'toyyibpay_ref', 'VARCHAR(100) DEFAULT NULL')
  await addColumn('orders', 'courier_name', 'VARCHAR(100) DEFAULT NULL')
  await addColumn('orders', 'lang', "VARCHAR(5) DEFAULT 'en'")
  // ── WhatsApp order support columns ──
  await addColumn('orders', 'source', "VARCHAR(20) NOT NULL DEFAULT 'website'")
  await addColumn('orders', 'full_name', 'VARCHAR(255) DEFAULT NULL')
  await addColumn('orders', 'email', 'VARCHAR(255) DEFAULT NULL')
  await addColumn('orders', 'phone', 'VARCHAR(30) DEFAULT NULL')
  await addColumn('orders', 'delivery_address', 'TEXT DEFAULT NULL')
  await addColumn('orders', 'postcode', 'VARCHAR(10) DEFAULT NULL')
  await addColumn('orders', 'zone', "VARCHAR(20) DEFAULT 'WM'")
  await addColumn('orders', 'sim_fee', 'DECIMAL(10,2) DEFAULT NULL')
  await addColumn('orders', 'alt_phone', 'VARCHAR(20) DEFAULT NULL')
  await addColumn('orders', 'address_line1', 'VARCHAR(255) DEFAULT NULL')
  await addColumn('orders', 'address_line2', 'VARCHAR(255) DEFAULT NULL')
  await addColumn('orders', 'city', 'VARCHAR(100) DEFAULT NULL')
  await addColumn('orders', 'country', "VARCHAR(100) NOT NULL DEFAULT 'Malaysia'")
  await addColumn('orders', 'voucher_code', 'VARCHAR(40) DEFAULT NULL')
  await addColumn('orders', 'voucher_discount', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00')
  await ensureOrderPlanColumns()
  // Abandoned-order reminder tracking (nullable — PHP site unaffected)
  await addColumn('orders', 'reminder_sent_at', 'DATETIME DEFAULT NULL')
  // Seed feature toggles (visible/editable in /hs/settings) — both OFF by default.
  // wa_proactive_enabled gates ALL business-initiated WhatsApp sends (they cost money
  // outside the 24h customer-service window on the free WhatsApp tier).
  await execute(
    `INSERT IGNORE INTO \`settings\` (\`setting_key\`, \`setting_value\`) VALUES
     ('abandoned_reminder_enabled', '0'),
     ('wa_proactive_enabled', '0')`
  )
  // Make customer_id + courier_id nullable for WA-originated orders
  try {
    await execute("ALTER TABLE `orders` MODIFY COLUMN `customer_id` INT DEFAULT NULL")
    await execute("ALTER TABLE `orders` MODIFY COLUMN `courier_id` INT DEFAULT NULL")
    await execute("ALTER TABLE `orders` MODIFY COLUMN `product_id` INT DEFAULT NULL")
  } catch { /* may already be nullable */ }
  await addColumn('customers', 'email_verified', 'TINYINT(1) DEFAULT 0')
  await addColumn('login_attempts', 'location', 'VARCHAR(255) DEFAULT NULL')
  await addColumn('login_attempts', 'isp', 'VARCHAR(255) DEFAULT NULL')
  await addColumn('login_attempts', 'password_tried', 'VARCHAR(255) DEFAULT NULL')
  await addColumn('login_attempts', 'attempt_type', 'VARCHAR(50) DEFAULT \'WRONG_PASSWORD\'')
  await addColumn('login_attempts', 'referer', 'TEXT DEFAULT NULL')
  await addColumn('login_attempts', 'browser_lang', 'VARCHAR(100) DEFAULT NULL')

  // Alter existing orders table columns to match PHP names (migration support)
  try { await execute("ALTER TABLE `orders` CHANGE COLUMN `shipping_name` `full_name` VARCHAR(255) NOT NULL") } catch {}
  try { await execute("ALTER TABLE `orders` CHANGE COLUMN `shipping_phone` `phone` VARCHAR(20) NOT NULL") } catch {}
  try { await execute("ALTER TABLE `orders` CHANGE COLUMN `shipping_address` `delivery_address` TEXT NOT NULL") } catch {}
  try { await execute("ALTER TABLE `orders` CHANGE COLUMN `shipping_postcode` `postcode` VARCHAR(10) NOT NULL") } catch {}
  try { await execute("ALTER TABLE `orders` CHANGE COLUMN `shipping_state` `state` VARCHAR(100) NOT NULL") } catch {}
  try { await execute("ALTER TABLE `orders` CHANGE COLUMN `delivery_zone` `zone` ENUM('WM','EM','Labuan') NOT NULL") } catch {}
  try { await execute("ALTER TABLE `orders` MODIFY COLUMN `customer_id` INT DEFAULT NULL") } catch {}
  try { await execute("ALTER TABLE `orders` MODIFY COLUMN `courier_id` INT DEFAULT NULL") } catch {}

  // If legacy column postcode_prefix exists, rename it to postcode_start and add postcode_end
  try {
    await execute("ALTER TABLE `postcode_zones` CHANGE COLUMN `postcode_prefix` `postcode_start` INT NOT NULL")
    await execute("ALTER TABLE `postcode_zones` ADD COLUMN `postcode_end` INT NOT NULL AFTER `postcode_start`")
    await execute("ALTER TABLE `postcode_zones` ADD COLUMN `description` VARCHAR(100) DEFAULT NULL AFTER `zone`")
    await execute("ALTER TABLE `postcode_zones` DROP INDEX `idx_postcode_prefix`")
  } catch {}

  // Add missing columns to existing tables
  await addColumn('customers', 'address', "TEXT DEFAULT NULL")
  await addColumn('customers', 'postcode', "VARCHAR(10) DEFAULT NULL")
  await addColumn('customers', 'state', "VARCHAR(100) DEFAULT NULL")
  await addColumn('couriers', 'tracking_url', "VARCHAR(500) DEFAULT NULL")
  await addColumn('products', 'weight_g', "INT NOT NULL DEFAULT 0")
  await addColumn('products', 'stock', "INT NOT NULL DEFAULT -1")
  await addColumn('products', 'image_url', "VARCHAR(500) DEFAULT NULL")
  await addColumn('orders', 'source', "VARCHAR(20) DEFAULT 'website'")
  // Session privilege boundary — see lib/session.ts. Existing rows default
  // to 'customer'; any live admin session is forced to re-login (fail-closed).
  await addColumn('sessions', 'role', "VARCHAR(20) NOT NULL DEFAULT 'customer'")
}

// ── WhatsApp Tables ──────────────────────────────────────────

async function ensureWhatsAppTables(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS \`whatsapp_config\` (
      \`cfg_key\` VARCHAR(64) PRIMARY KEY,
      \`cfg_value\` TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`whatsapp_processed\` (
      \`msg_id\` VARCHAR(128) PRIMARY KEY,
      \`processed_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`whatsapp_logs\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`msg_id\` VARCHAR(128) DEFAULT NULL,
      \`phone\` VARCHAR(30) NOT NULL,
      \`contact_name\` VARCHAR(100) DEFAULT NULL,
      \`direction\` ENUM('in','out') NOT NULL,
      \`message\` TEXT DEFAULT NULL,
      \`msg_type\` VARCHAR(30) DEFAULT 'text',
      \`is_ai\` TINYINT(1) DEFAULT 0,
      \`media_id\` VARCHAR(128) DEFAULT NULL,
      \`media_path\` VARCHAR(500) DEFAULT NULL,
      \`reply_to_msg_id\` VARCHAR(128) DEFAULT NULL,
      \`delivery_status\` VARCHAR(30) DEFAULT NULL,
      \`local_date\` DATE NOT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_phone\` (\`phone\`),
      INDEX \`idx_msg_id\` (\`msg_id\`),
      INDEX \`idx_direction\` (\`direction\`),
      INDEX \`idx_local_date\` (\`local_date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_conversations\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`phone\` VARCHAR(30) NOT NULL,
      \`contact_name\` VARCHAR(100) DEFAULT NULL,
      \`direction\` ENUM('in', 'out') NOT NULL,
      \`message\` TEXT NOT NULL,
      \`msg_id\` VARCHAR(128) DEFAULT NULL,
      \`media_data\` TEXT DEFAULT NULL,
      \`local_date\` DATE NOT NULL,
      \`gemini_model\` VARCHAR(50) DEFAULT NULL,
      \`reply_ms\` INT DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`escalated\` TINYINT(1) DEFAULT 0,
      \`edited\` TINYINT(1) DEFAULT 0,
      \`media_id\` VARCHAR(128) DEFAULT NULL,
      \`reply_to_msg_id\` VARCHAR(128) DEFAULT NULL,
      \`language\` VARCHAR(10) DEFAULT NULL,
      \`intent\` VARCHAR(50) DEFAULT NULL,
      \`sentiment\` VARCHAR(20) DEFAULT NULL,
      INDEX \`idx_phone\` (\`phone\`),
      INDEX \`idx_direction\` (\`direction\`),
      INDEX \`idx_msg_id\` (\`msg_id\`),
      INDEX \`idx_created\` (\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_customers\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`phone\` VARCHAR(30) NOT NULL UNIQUE,
      \`contact_name\` VARCHAR(100) DEFAULT NULL,
      \`first_seen\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`last_seen\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      \`ic_number\` VARCHAR(20) DEFAULT NULL,
      \`postcode\` VARCHAR(10) DEFAULT NULL,
      \`preferred_plan\` VARCHAR(50) DEFAULT NULL,
      \`meetup\` TINYINT(1) DEFAULT 0,
      \`state\` VARCHAR(100) DEFAULT NULL,
      INDEX \`idx_phone\` (\`phone\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_sessions\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`phone\` VARCHAR(30) NOT NULL,
      \`session_data\` TEXT DEFAULT NULL,
      \`last_activity\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      \`started_at\` DATETIME DEFAULT NULL,
      \`last_msg_at\` DATETIME DEFAULT NULL,
      \`msg_count\` INT DEFAULT 0,
      \`ai_replies\` INT DEFAULT 0,
      \`primary_intent\` VARCHAR(50) DEFAULT NULL,
      \`primary_lang\` VARCHAR(10) DEFAULT NULL,
      INDEX \`idx_phone\` (\`phone\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)



  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_pending_queue\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`phone\` VARCHAR(30) NOT NULL,
      \`message\` TEXT NOT NULL,
      \`media_data\` TEXT DEFAULT NULL,
      \`reason\` VARCHAR(200) DEFAULT NULL,
      \`status\` ENUM('pending', 'processing', 'done', 'failed') DEFAULT 'pending',
      \`retry_count\` INT DEFAULT 0,
      \`next_retry_at\` DATETIME DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_status\` (\`status\`),
      INDEX \`idx_next_retry\` (\`next_retry_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_reply_queue\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`phone\` VARCHAR(30) NOT NULL,
      \`message\` TEXT NOT NULL,
      \`scheduled_at\` DATETIME NOT NULL,
      \`status\` ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_status_scheduled\` (\`status\`, \`scheduled_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_rate_limits\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`phone\` VARCHAR(30) NOT NULL,
      \`window_start\` DATETIME NOT NULL,
      \`msg_count\` INT DEFAULT 0,
      UNIQUE KEY \`idx_phone_window\` (\`phone\`, \`window_start\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  try {
    await execute("ALTER TABLE `wa_rate_limits` CHANGE COLUMN `request_count` `msg_count` INT DEFAULT 0")
  } catch {}

  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_admin_notices\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`notice_type\` VARCHAR(64) NOT NULL,
      \`message\` TEXT NOT NULL,
      \`context\` TEXT DEFAULT NULL,
      \`is_read\` TINYINT(1) DEFAULT 0,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_type_read\` (\`notice_type\`, \`is_read\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_conversation_tags\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`phone\` VARCHAR(30) NOT NULL,
      \`tag_name\` VARCHAR(64) NOT NULL,
      \`tag_color\` VARCHAR(20) DEFAULT '#9B7BFF',
      INDEX \`idx_phone\` (\`phone\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_conversation_notes\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`phone\` VARCHAR(30) NOT NULL,
      \`admin_id\` VARCHAR(64) NOT NULL,
      \`note\` TEXT NOT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_phone\` (\`phone\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_templates\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`template_name\` VARCHAR(128) NOT NULL,
      \`shortcut\` VARCHAR(20) DEFAULT NULL,
      \`content\` TEXT NOT NULL,
      \`category\` VARCHAR(64) DEFAULT NULL,
      UNIQUE KEY \`uk_shortcut\` (\`shortcut\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_escalation_rules\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`rule_name\` VARCHAR(128) NOT NULL,
      \`condition_type\` VARCHAR(64) NOT NULL,
      \`threshold\` INT NOT NULL DEFAULT 3,
      \`is_active\` TINYINT(1) DEFAULT 1,
      \`action_pause_bot\` TINYINT(1) DEFAULT 1,
      \`action_add_tag\` TINYINT(1) DEFAULT 0,
      \`action_notify_admin\` TINYINT(1) DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_audit_log\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`admin_id\` VARCHAR(64) NOT NULL,
      \`action\` VARCHAR(128) NOT NULL,
      \`details\` TEXT DEFAULT NULL,
      \`ip_address\` VARCHAR(45) DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_admin\` (\`admin_id\`),
      INDEX \`idx_action\` (\`action\`),
      INDEX \`idx_created\` (\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_admin_prefs\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`admin_id\` VARCHAR(64) NOT NULL,
      \`pref_key\` VARCHAR(64) NOT NULL,
      \`pref_value\` TEXT NOT NULL,
      UNIQUE KEY \`uk_admin_key\` (\`admin_id\`, \`pref_key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_scheduled_messages\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`phone\` VARCHAR(30) NOT NULL,
      \`contact_name\` VARCHAR(100) DEFAULT NULL,
      \`message\` TEXT NOT NULL,
      \`scheduled_at\` DATETIME NOT NULL,
      \`status\` ENUM('pending', 'sent', 'failed', 'cancelled') DEFAULT 'pending',
      \`admin_id\` VARCHAR(64) DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_status_scheduled\` (\`status\`, \`scheduled_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_test_logs\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`session_id\` VARCHAR(64) NOT NULL,
      \`message\` TEXT NOT NULL,
      \`response\` TEXT DEFAULT NULL,
      \`model\` VARCHAR(50) DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_session\` (\`session_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`wa_message_reactions\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`log_id\` INT DEFAULT NULL,
      \`phone\` VARCHAR(30) NOT NULL,
      \`msg_id\` VARCHAR(128) NOT NULL,
      \`emoji\` VARCHAR(20) NOT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_log_id\` (\`log_id\`),
      INDEX \`idx_phone_msg\` (\`phone\`, \`msg_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // Upgrade imported PHP tables only after this module's tables exist.
  await addColumn('wa_customers', 'full_name', 'VARCHAR(255) DEFAULT NULL')
  await addColumn('wa_customers', 'delivery_addr', 'TEXT DEFAULT NULL')
  await addColumn('wa_conversations', 'language', "VARCHAR(10) DEFAULT NULL")
  await addColumn('wa_conversations', 'intent', "VARCHAR(50) DEFAULT NULL")
  await addColumn('wa_conversations', 'sentiment', "VARCHAR(20) DEFAULT NULL")
  await addColumn('wa_customers', 'ic_number', "VARCHAR(20) DEFAULT NULL")
  await addColumn('wa_customers', 'postcode', "VARCHAR(10) DEFAULT NULL")
  await addColumn('wa_customers', 'preferred_plan', "VARCHAR(50) DEFAULT NULL")
  await addColumn('wa_customers', 'meetup', "TINYINT(1) DEFAULT 0")
  await addColumn('wa_customers', 'state', "VARCHAR(100) DEFAULT NULL")
  await addColumn('wa_sessions', 'started_at', "DATETIME DEFAULT NULL")
  await addColumn('wa_sessions', 'last_msg_at', "DATETIME DEFAULT NULL")
  await addColumn('wa_sessions', 'msg_count', "INT DEFAULT 0")
  await addColumn('wa_sessions', 'ai_replies', "INT DEFAULT 0")
  await addColumn('wa_sessions', 'primary_intent', "VARCHAR(50) DEFAULT NULL")
  await addColumn('wa_sessions', 'primary_lang', "VARCHAR(10) DEFAULT NULL")

  // Fix wa_rate_limits: upgrade INDEX to UNIQUE KEY for ON DUPLICATE KEY UPDATE
  try {
    await execute("ALTER TABLE `wa_rate_limits` DROP INDEX `idx_phone_window`")
    await execute("ALTER TABLE `wa_rate_limits` ADD UNIQUE KEY `idx_phone_window` (`phone`, `window_start`)")
  } catch {
    // Index may already be unique or not exist yet — safe to ignore
  }

  // Fix wa_message_reactions: make log_id nullable
  try {
    await execute("ALTER TABLE `wa_message_reactions` MODIFY COLUMN `log_id` INT DEFAULT NULL")
  } catch {
    // Column may not exist yet or already nullable — safe to ignore
  }
}

// ── Telegram Tables ──────────────────────────────────────────

async function ensureTelegramTables(): Promise<void> {
  // telegram_settings — matches production schema (key/value/updated_at)
  await execute(`
    CREATE TABLE IF NOT EXISTS \`telegram_settings\` (
      \`key\` VARCHAR(64) NOT NULL,
      \`value\` TEXT DEFAULT NULL,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // telegram_conversations — matches production schema
  await execute(`
    CREATE TABLE IF NOT EXISTS \`telegram_conversations\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`chat_id\` BIGINT NOT NULL,
      \`chat_type\` VARCHAR(16) NOT NULL DEFAULT 'private',
      \`title\` VARCHAR(255) NOT NULL DEFAULT '',
      \`username\` VARCHAR(128) NOT NULL DEFAULT '',
      \`first_name\` VARCHAR(128) NOT NULL DEFAULT '',
      \`last_name\` VARCHAR(128) NOT NULL DEFAULT '',
      \`is_admin_chat\` TINYINT(1) NOT NULL DEFAULT 0,
      \`unread_count\` INT NOT NULL DEFAULT 0,
      \`last_message_text\` TEXT DEFAULT NULL,
      \`last_message_at\` DATETIME DEFAULT NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`uk_chat_id\` (\`chat_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // telegram_messages — matches production schema
  await execute(`
    CREATE TABLE IF NOT EXISTS \`telegram_messages\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`chat_id\` BIGINT NOT NULL,
      \`message_id\` BIGINT DEFAULT NULL COMMENT 'Telegram message_id',
      \`direction\` ENUM('in', 'out') NOT NULL DEFAULT 'out',
      \`message_type\` VARCHAR(32) NOT NULL DEFAULT 'text',
      \`text\` TEXT DEFAULT NULL,
      \`file_id\` VARCHAR(256) NOT NULL DEFAULT '',
      \`caption\` TEXT DEFAULT NULL,
      \`raw_data\` LONGTEXT DEFAULT NULL,
      \`sent_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_chat_id\` (\`chat_id\`),
      INDEX \`idx_sent_at\` (\`sent_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // ── Migration: rename legacy columns if old schema exists ──
  // telegram_settings: cfg_key → key, cfg_value → value
  try {
    await execute("ALTER TABLE `telegram_settings` CHANGE COLUMN `cfg_key` `key` VARCHAR(64) NOT NULL")
  } catch { /* column may not exist or already renamed */ }
  try {
    await execute("ALTER TABLE `telegram_settings` CHANGE COLUMN `cfg_value` `value` TEXT DEFAULT NULL")
  } catch { /* column may not exist or already renamed */ }
  try {
    await execute("ALTER TABLE `telegram_settings` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
  } catch { /* column may already exist */ }

  // telegram_conversations: add missing columns
  await addColumn('telegram_conversations', 'chat_type', "VARCHAR(16) NOT NULL DEFAULT 'private'")
  await addColumn('telegram_conversations', 'title', "VARCHAR(255) NOT NULL DEFAULT ''")
  await addColumn('telegram_conversations', 'last_name', "VARCHAR(128) NOT NULL DEFAULT ''")
  await addColumn('telegram_conversations', 'is_admin_chat', "TINYINT(1) NOT NULL DEFAULT 0")
  await addColumn('telegram_conversations', 'last_message_text', "TEXT DEFAULT NULL")
  await addColumn('telegram_conversations', 'created_at', "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP")
  await addColumn('telegram_conversations', 'updated_at', "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")

  // telegram_messages: rename legacy columns, add missing ones
  try {
    await execute("ALTER TABLE `telegram_messages` CHANGE COLUMN `message` `text` TEXT DEFAULT NULL")
  } catch { /* column may not exist or already renamed */ }
  try {
    await execute("ALTER TABLE `telegram_messages` CHANGE COLUMN `msg_type` `message_type` VARCHAR(32) NOT NULL DEFAULT 'text'")
  } catch { /* column may not exist or already renamed */ }
  try {
    await execute("ALTER TABLE `telegram_messages` CHANGE COLUMN `created_at` `sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP")
  } catch { /* column may not exist or already renamed */ }
  await addColumn('telegram_messages', 'file_id', "VARCHAR(256) NOT NULL DEFAULT ''")
  await addColumn('telegram_messages', 'caption', "TEXT DEFAULT NULL")
  await addColumn('telegram_messages', 'raw_data', "LONGTEXT DEFAULT NULL")
  await addColumn('telegram_messages', 'msg_type', "VARCHAR(20) DEFAULT 'text'")
  await addColumn('telegram_conversations', 'first_name', "VARCHAR(100) DEFAULT NULL")
  await addColumn('telegram_conversations', 'last_message_at', "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")
}

// ── Shopee Tracking Tables ─────────────────────────────────────

async function ensureShopeeTrackingTables(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS \`shopee_orders\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`tracking_number\` VARCHAR(60) NOT NULL UNIQUE,
      \`shopee_order_id\` VARCHAR(120) DEFAULT NULL,
      \`status\` ENUM('pending','processing','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
      \`notes\` TEXT DEFAULT NULL,
      \`tracking_data\` LONGTEXT DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_status\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

// ── Voucher & Coupon Tables ────────────────────────────────────

async function ensureVoucherTables(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS \`voucher_campaigns\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`name\` VARCHAR(120) NOT NULL,
      \`discount_type\` ENUM('fixed','percent') NOT NULL DEFAULT 'fixed',
      \`discount_value\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`min_spend\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`max_discount\` DECIMAL(10,2) DEFAULT NULL,
      \`validity_days\` INT NOT NULL DEFAULT 30,
      \`is_welcome\` TINYINT(1) NOT NULL DEFAULT 0,
      \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_vc_welcome\` (\`is_welcome\`, \`is_active\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS \`customer_vouchers\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`customer_id\` INT NOT NULL,
      \`campaign_id\` INT DEFAULT NULL,
      \`code\` VARCHAR(40) NOT NULL UNIQUE,
      \`discount_type\` ENUM('fixed','percent') NOT NULL DEFAULT 'fixed',
      \`discount_value\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`min_spend\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`max_discount\` DECIMAL(10,2) DEFAULT NULL,
      \`status\` ENUM('active','redeemed','expired') NOT NULL DEFAULT 'active',
      \`order_id\` INT DEFAULT NULL,
      \`redeemed_amount\` DECIMAL(10,2) DEFAULT NULL,
      \`issued_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`expires_at\` DATETIME DEFAULT NULL,
      \`redeemed_at\` DATETIME DEFAULT NULL,
      INDEX \`idx_cv_customer\` (\`customer_id\`),
      INDEX \`idx_cv_status\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // Add order columns
  await addColumn('orders', 'voucher_code', 'VARCHAR(40) DEFAULT NULL AFTER `total_amount`')
  await addColumn('orders', 'voucher_discount', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `voucher_code`')
}
