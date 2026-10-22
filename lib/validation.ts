// ─────────────────────────────────────────────────────────────
// Zod Validation Schemas
// Centralized input validation for all API routes
// ─────────────────────────────────────────────────────────────

import { z } from 'zod'

// ── Auth Schemas ─────────────────────────────────────────────

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must not exceed 100 characters'),
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email address')
    .max(254, 'Email must not exceed 254 characters')
    .toLowerCase()
    .trim(),
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .regex(
      /^(\+?60|0)[0-9]{8,10}$/,
      'Invalid Malaysian phone number format'
    )
    .transform((val) => val.replace(/[\s-]/g, '')),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit'),
})

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email address')
    .max(254, 'Email must not exceed 254 characters')
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password must not exceed 128 characters'),
})

// ── Order Schema ─────────────────────────────────────────────

export const orderSchema = z.object({
  product_id: z
    .number()
    .int('Product ID must be an integer')
    .positive('Product ID must be positive'),
  quantity: z
    .number()
    .int('Quantity must be an integer')
    .min(1, 'Quantity must be at least 1')
    .max(99, 'Quantity must not exceed 99'),
  full_name: z
    .string()
    .min(1, 'Full name is required')
    .max(100, 'Full name must not exceed 100 characters')
    .trim(),
  phone: z
    .string()
    .min(1, 'Phone is required')
    .regex(
      /^(\+?60|0)[0-9]{8,10}$/,
      'Invalid Malaysian phone number format'
    )
    .transform((val) => val.replace(/[\s-]/g, '')),
  delivery_address: z
    .string()
    .min(1, 'Delivery address is required')
    .max(500, 'Delivery address must not exceed 500 characters')
    .trim(),
  state: z
    .string()
    .min(1, 'State is required')
    .max(100, 'State must not exceed 100 characters')
    .trim(),
  postcode: z
    .string()
    .min(1, 'Postcode is required')
    .regex(/^[0-9]{5}$/, 'Invalid Malaysian postcode (5 digits required)')
    .trim(),
  notes: z
    .string()
    .max(500, 'Notes must not exceed 500 characters')
    .trim()
    .optional()
    .default(''),
})

// ── Review Schema ────────────────────────────────────────────

export const reviewSchema = z.object({
  order_id: z
    .number()
    .int('Order ID must be an integer')
    .positive('Order ID must be positive'),
  rating: z
    .number()
    .int('Rating must be an integer')
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating must not exceed 5'),
  comment: z.string().trim().min(10, 'Review must contain at least 10 characters').max(1000),
  display_mode: z.enum(['public', 'private']).optional().default('public'),
  display_name: z.string().trim().max(40).optional(),
  categories: z.array(z.enum(['signal', 'speed', 'delivery', 'support', 'value', 'coverage', 'app', 'setup'])).max(8).optional().default([]),
  photo_url: z.string().trim().max(500).regex(/^\/uploads\/(?:reviews\/)?[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i, 'Invalid review photo path').optional(),
})

// ── Settings Schema ──────────────────────────────────────────

export const forgotSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email address')
    .max(254, 'Email must not exceed 254 characters')
    .toLowerCase()
    .trim(),
})

export const resetSchema = z.object({
  token: z
    .string()
    .min(1, 'Reset token is required')
    .max(128, 'Reset token must not exceed 128 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit'),
})

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must not exceed 100 characters'),
  phone: z
    .string()
    .regex(/^(\+?60|0)[0-9]{8,10}$/, 'Invalid Malaysian phone number format')
    .transform((val) => val.replace(/[\s-]/g, ''))
    .optional()
    .or(z.literal('')),
  address: z.string().max(500, 'Address must not exceed 500 characters').trim().optional().default(''),
  postcode: z.string().max(10, 'Postcode must not exceed 10 characters').trim().optional().default(''),
  state: z.string().max(100, 'State must not exceed 100 characters').trim().optional().default(''),
})

export const updatePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Current password is required')
    .max(128, 'Current password must not exceed 128 characters'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit'),
})

export const chatSchema = z.object({
  message: z
    .string()
    .min(1, 'Message is required')
    .max(2000, 'Message must not exceed 2000 characters')
    .trim(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'model']),
        content: z.string().max(5000),
      })
    )
    .max(20, 'History must not exceed 20 messages')
    .optional()
    .default([]),
})

export const adminOrderUpdateSchema = z.object({
  orderId: z.number().int('Order ID must be an integer').positive('Order ID must be positive'),
  orderStatus: z
    .enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])
    .optional(),
  trackingNumber: z.string().max(100, 'Tracking number must not exceed 100 characters').optional(),
  courierName: z.string().trim().max(100, 'Courier name must not exceed 100 characters').optional(),
})

const productFields = {
  name: z.string().trim().min(1, 'Product name is required').max(150),
  description: z.string().max(500),
  price: z.number().min(0, 'Price must be non-negative'),
  weight_g: z.number().int().min(0),
  stock: z.number().int().min(-1),
  is_active: z.number().int().min(0).max(1),
  sort_order: z.number().int().min(0),
  image_url: z.string().max(500),
}
export const adminProductSchema = z.object({ ...productFields,
  description: productFields.description.default(''),
  weight_g: productFields.weight_g.default(0),
  stock: productFields.stock.default(-1),
  is_active: productFields.is_active.default(1),
  sort_order: productFields.sort_order.default(0),
  image_url: productFields.image_url.default(''),
})

export const adminProductUpdateSchema = z.object(productFields).partial().extend({
  id: z.number().int('Product ID must be an integer').positive('Product ID must be positive'),
})

const courierFields = {
  name: z.string().trim().min(1, 'Courier name is required').max(100),
  tracking_url: z.string().max(500),
  wm_fee: z.number().min(0),
  em_fee: z.number().min(0),
  labuan_fee: z.number().min(0),
  is_active: z.number().int().min(0).max(1),
  sort_order: z.number().int().min(0),
}
export const adminCourierSchema = z.object({ ...courierFields,
  tracking_url: courierFields.tracking_url.default(''),
  is_active: courierFields.is_active.default(1),
  sort_order: courierFields.sort_order.default(0),
})

export const adminCourierUpdateSchema = z.object(courierFields).partial().extend({
  id: z.number().int('Courier ID must be an integer').positive('Courier ID must be positive'),
})

export const adminZoneSchema = z.object({
  postcode_start: z.number().int().min(1).max(99999),
  postcode_end: z.number().int().min(1).max(99999),
  zone: z.enum(['WM', 'EM', 'Labuan']),
  description: z.string().trim().max(100).optional().default(''),
}).refine(data => data.postcode_start < data.postcode_end, {
  message: 'Postcode start must be less than postcode end.', path: ['postcode_end'],
})

export const adminReviewActionSchema = z.object({
  reviewId: z.number().int().positive(),
  action: z.enum(['approve', 'reject', 'set_pending', 'delete']),
})

export const settingsSchema = z.record(
  z.string().min(1, 'Setting key is required').max(100),
  z.string().max(5000, 'Setting value must not exceed 5000 characters')
)

// ── Type Exports ─────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type OrderInput = z.infer<typeof orderSchema>
export type ReviewInput = z.infer<typeof reviewSchema>
export type SettingsInput = z.infer<typeof settingsSchema>
export type ForgotInput = z.infer<typeof forgotSchema>
export type ResetInput = z.infer<typeof resetSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>
export type ChatInput = z.infer<typeof chatSchema>
export type AdminOrderUpdateInput = z.infer<typeof adminOrderUpdateSchema>
export type AdminProductInput = z.infer<typeof adminProductSchema>
export type AdminCourierInput = z.infer<typeof adminCourierSchema>
export type AdminReviewActionInput = z.infer<typeof adminReviewActionSchema>

// ── Validation Helper ────────────────────────────────────────

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string> }

/**
 * Validate data against a Zod schema.
 * Returns a typed result object instead of throwing.
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  }

  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const path = issue.path.join('.')
    errors[path || '_form'] = issue.message
  }

  return { success: false, errors }
}
