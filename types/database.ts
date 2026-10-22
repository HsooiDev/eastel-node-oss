// ─────────────────────────────────────────────────────────────
// Database TypeScript Interfaces
// Maps to MariaDB tables in the `eastel` database
// ─────────────────────────────────────────────────────────────

// ── Core Tables ──────────────────────────────────────────────

export interface Customer {
  id: number
  name: string
  email: string
  phone: string
  password_hash: string
  is_temp_pass: number // 0 or 1
  address: string | null
  postcode: string | null
  state: string | null
  reset_token: string | null
  reset_expires: string | null // datetime
  created_at: string
}

export interface Order {
  id: number
  order_ref: string // format: ORD-20250501-XXXX
  customer_id: number | null
  courier_id: number
  courier_name: string
  email: string
  sim_fee: string // price charged at purchase
  plan_snapshot: string | null // immutable optional plan purchase details
  plan_fee: string // separately collected manual plan purchase amount
  plan_fulfilled_at: string | null
  plan_fulfilled_by: number | null
  delivery_fee: string
  total_amount: string
  payment_status: 'pending' | 'paid' | 'failed'
  order_status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  tracking_number: string | null
  bill_code: string | null
  full_name: string
  phone: string
  delivery_address: string
  postcode: string
  state: string
  zone: 'WM' | 'EM' | 'Labuan'
  source?: string
  created_at: string
  updated_at: string
}

export interface Product {
  id: number
  name: string
  description: string | null
  price: string // decimal
  weight_g: number
  stock: number // -1 = unlimited
  is_active: number
  sort_order: number
  image_url: string | null
  created_at: string
}

export interface Courier {
  id: number
  name: string
  tracking_url: string | null
  wm_fee: string // decimal
  em_fee: string
  labuan_fee: string
  is_active: number
  sort_order: number
}

export interface PostcodeZone {
  id: number
  postcode_start: number
  postcode_end: number
  zone: 'WM' | 'EM' | 'Labuan'
  description?: string | null
}

export interface Review {
  id: number
  customer_id: number
  order_id: number
  rating: number // 1-5
  review_text: string
  display_mode: 'public' | 'private'
  display_name: string
  categories: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export interface ReviewPhoto {
  id: number
  review_id: number
  file_path: string
  sort_order: number
}

export interface AdminUser {
  id: number
  name: string
  email: string
  password_hash: string
  created_at: string
}

export interface LoginAttempt {
  id: number
  ip_address: string
  email: string
  success: number
  user_agent: string | null
  attempted_at: string
}

export interface TurnstileLog {
  id: number
  ip_address: string
  token_prefix: string
  success: number
  action: string
  created_at: string
}

export interface Setting {
  setting_key: string
  setting_value: string
  updated_at: string
}

// ── Auth / Session Tables ────────────────────────────────────

export interface Session {
  id: string // UUID
  user_id: number
  role: 'admin' | 'customer'
  session_token: string
  device_info: string | null
  ip_address: string | null
  expires_at: string
  revoked: number
  created_at: string
  updated_at: string
}

export interface EmailVerification {
  id: number
  customer_id: number
  code: string
  expires_at: string
  created_at: string
}

// ── WhatsApp Tables ──────────────────────────────────────────

export interface WaConversation {
  id: number
  phone: string
  contact_name: string | null
  direction: 'in' | 'out'
  message: string
  msg_id: string | null
  media_data: string | null
  local_date: string
  gemini_model: string | null
  reply_ms: number | null
  created_at: string
  escalated: number
  edited: number
  media_id: string | null
  reply_to_msg_id: string | null
}

export interface WaCustomer {
  id: number
  phone: string
  contact_name: string | null
  first_seen: string
  last_seen: string
}

export interface WaSession {
  id: number
  phone: string
  session_data: string | null
  last_activity: string
}

export interface WaDailyUsage {
  id: number
  phone: string
  usage_date: string
  request_count: number
}

export interface WaPendingQueue {
  id: number
  phone: string
  message: string
  media_data: string | null
  reason: string | null
  status: 'pending' | 'processing' | 'done' | 'failed'
  retry_count: number
  next_retry_at: string | null
  created_at: string
}

export interface WaReplyQueue {
  id: number
  phone: string
  message: string
  scheduled_at: string
  status: 'pending' | 'sent' | 'failed'
  created_at: string
}

export interface WaRateLimit {
  id: number
  phone: string
  window_start: string
  msg_count: number
}

export interface WaAdminNotice {
  id: number
  notice_type: string
  message: string
  context: string | null
  is_read: number
  created_at: string
}

export interface WaConversationTag {
  id: number
  phone: string
  tag_name: string
  tag_color: string
}

export interface WaConversationNote {
  id: number
  phone: string
  admin_id: string
  note: string
  created_at: string
}

export interface WaTemplate {
  id: number
  template_name: string
  shortcut: string | null
  content: string
  category: string | null
}

export interface WaEscalationRule {
  id: number
  rule_name: string
  condition_type: string
  threshold: number
  is_active: number
  action_pause_bot: number
  action_add_tag: number
  action_notify_admin: number
}

export interface WaAuditLog {
  id: number
  admin_id: string
  action: string
  details: string | null
  ip_address: string | null
  created_at: string
}

export interface WaAdminPref {
  id: number
  admin_id: string
  pref_key: string
  pref_value: string
}

export interface WaScheduledMessage {
  id: number
  phone: string
  contact_name: string | null
  message: string
  scheduled_at: string
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  admin_id: string | null
  created_at: string
}

export interface WaTestLog {
  id: number
  session_id: string
  message: string
  response: string | null
  model: string | null
  created_at: string
}

export interface WaMessageReaction {
  id: number
  log_id: number
  phone: string
  msg_id: string
  emoji: string
  created_at: string
}

export interface WhatsappProcessed {
  msg_id: string
  processed_at: string
}

export interface WhatsappConfig {
  cfg_key: string
  cfg_value: string
}

// ── Telegram Tables ──────────────────────────────────────────

export interface TelegramSetting {
  cfg_key: string
  cfg_value: string
}

export interface TelegramConversation {
  id: number
  chat_id: string
  contact_name: string | null
  username: string | null
  first_seen: string
  last_seen: string
  unread_count: number
}

export interface TelegramMessage {
  id: number
  chat_id: string
  direction: 'in' | 'out'
  message: string
  message_id: string | null
  created_at: string
}

// Cloudflare Turnstile
declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: {
        sitekey: string;
        action?: string;
        callback?: (token: string) => void;
        "error-callback"?: () => void;
        "expired-callback"?: () => void;
        theme?: string;
        size?: string;
      }) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}
export {};
