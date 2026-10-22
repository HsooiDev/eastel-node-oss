import { z } from 'zod'
import { getPlanCatalogue } from '@/lib/plan-recommender'
import { getStorefrontCheckout } from '@/lib/storefront'
import { availablePlan, recommend } from '@/public/recommender/engine.mjs'
import { SITE_URL } from '@/lib/site'
import { checkoutDetailsSchema, encryptCheckoutDetails, CHECKOUT_DETAILS_TTL_SECONDS } from '@/lib/ai-checkout-details'

const locale = z.enum(['en', 'ms', 'zh']).default('ms')
const quota = z.number().finite().min(0).max(1_000_000)
const money = quota.multipleOf(0.01)

export const commerceSchemas = {
  eastel_get_catalogue: z.object({ locale }).strict(),
  eastel_recommend_plan: z.object({
    locale,
    dataGB: quota.describe('Phone data needed, excluding hotspot, in GB.'),
    hotspotGB: quota.default(0),
    roamingGB: quota.default(0),
    budget: money.describe('Maximum price in MYR for the mobile plan alone; excludes SIM and shipping.'),
    minValidityDays: z.number().int().min(1).max(366).default(30),
  }).strict(),
  eastel_prepare_checkout: z.object({
    locale,
    plan_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/).optional(),
    purchase_option: z.enum(['sim_only', 'sim_and_plan']).optional().describe('Choose SIM-only or SIM plus a separately priced plan the merchant will buy manually after registration. If omitted, plan_id selects SIM plus plan; without plan_id the purchase is SIM-only.'),
    checkout_mode: z.enum(['assisted', 'website']).default('assisted'),
    details: checkoutDetailsSchema.optional().describe('Optional shipping and contact details the customer has chosen to provide for assisted form filling. Never include passwords, OTPs, bank/card data or security tokens.'),
  }).strict(),
}

export type CommerceToolName = keyof typeof commerceSchemas

export const commerceToolDescriptions: Record<CommerceToolName, string> = {
  eastel_get_catalogue: 'Read the current physical SIM price and available mobile plans. Customers can buy only the SIM or pay additionally for a plan the merchant will purchase manually after SIM registration. No customer information is returned.',
  eastel_recommend_plan: 'Recommend a currently available mobile plan for data, hotspot, roaming, validity and plan-only budget. Explain all gaps and budget shortfalls. This does not purchase or activate a plan.',
  eastel_prepare_checkout: 'Prepare checkout for one physical Eastel SIM, optionally including an available mobile plan at its additional price. Without a plan the purchase is SIM-only; purchase_option=sim_only explicitly excludes plan charges even if a plan is recommended. A purchased plan and fee are saved when the customer places the order; the merchant buys the plan manually after SIM registration. Default assisted mode can prefill voluntarily supplied contact/shipping details in a private link that expires in 15 minutes; website mode lets the customer fill the form themselves. No order or payment is created by this tool. The customer must review costs, complete email/security checks, and authorize payment. Never request passwords, OTPs or bank/card details in chat.',
}

export class CommerceError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message)
    this.name = 'CommerceError'
  }
}

const purchasePolicy = {
  purchasable_item: 'one_physical_prepaid_sim',
  quantity: 1,
  currency: 'MYR',
  plan_included: false,
  plan_purchase_optional: true,
  plan_activation: 'If a plan is purchased with the SIM, its price is charged separately and saved in the order. The merchant purchases the plan manually after the customer registers the SIM in the app. SIM-only orders have no plan charge.',
  shipping: 'Calculated from the delivery postcode and courier during website checkout.',
  customer_confirmation_required: true,
}

function orderUrl(language: string, planId?: string, purchaseOption?: 'sim_only' | 'sim_and_plan'): string {
  // The configured site origin is authoritative; never accept a caller-supplied
  // redirect, host, price, customer record or credentials.
  const site = new URL(SITE_URL)
  if (site.username || site.password || !['https:', 'http:'].includes(site.protocol)) {
    throw new Error('Invalid site origin')
  }
  const url = new URL(`/${language}/order`, site.origin)
  if (planId) url.searchParams.set('plan', planId)
  if (purchaseOption) url.searchParams.set('purchase', purchaseOption)
  return url.toString()
}

export async function executeCommerceTool(name: CommerceToolName, args: unknown): Promise<Record<string, unknown>> {
  try {
    if (name === 'eastel_get_catalogue') {
      const input = commerceSchemas[name].parse(args)
      const [catalogue, storefront] = await Promise.all([getPlanCatalogue(), getStorefrontCheckout()])
      return {
        status: 'success',
        currency: 'MYR',
        product: storefront.product,
        plans: catalogue.plans.filter(plan => plan.status === 'available'),
        checkout_available: Boolean(storefront.product?.available && storefront.couriers.length),
        purchase_policy: purchasePolicy,
        checkout_url: storefront.product?.available && storefront.couriers.length ? orderUrl(input.locale) : null,
      }
    }

    if (name === 'eastel_recommend_plan') {
      const input = commerceSchemas[name].parse(args)
      const result = recommend(await getPlanCatalogue(), input)
      return {
        status: 'success',
        currency: 'MYR',
        recommendation: result,
        plan_budget_excludes_sim_and_shipping: true,
        purchase_policy: purchasePolicy,
      }
    }

    if (name === 'eastel_prepare_checkout') {
      const input = commerceSchemas[name].parse(args)
      if (input.checkout_mode === 'website' && input.details) {
        throw new CommerceError('invalid_arguments', 'Do not send personal details in website mode. The customer will enter them on the website.')
      }
      const purchaseOption = input.purchase_option ?? (input.plan_id ? 'sim_and_plan' : 'sim_only')
      if (purchaseOption === 'sim_and_plan' && !input.plan_id) {
        throw new CommerceError('invalid_arguments', 'Select an available mobile plan to purchase SIM plus plan, or choose SIM-only.')
      }
      const storefront = await getStorefrontCheckout()
      if (!storefront.product?.available || !storefront.couriers.length) {
        throw new CommerceError('checkout_unavailable', 'SIM checkout is currently unavailable. Please try again later.', 409)
      }
      // SIM-only is an independent purchase: an old recommendation must not
      // charge a plan or prevent a customer buying just the SIM.
      const plan = purchaseOption === 'sim_and_plan' && input.plan_id ? availablePlan(await getPlanCatalogue(), input.plan_id) : null
      if (purchaseOption === 'sim_and_plan' && !plan) {
        throw new CommerceError('plan_unavailable', 'The requested mobile plan is unavailable. Read the current catalogue before choosing a plan.', 409)
      }
      const url = new URL(orderUrl(input.locale, plan?.id, purchaseOption))
      if (input.details) url.hash = `ai_checkout=${await encryptCheckoutDetails(input.details)}`
      return {
        status: 'success',
        checkout_url: url.toString(),
        checkout_mode: input.checkout_mode,
        purchase_option: purchaseOption,
        details_prefilled: Boolean(input.details),
        details_expire_in_seconds: input.details ? CHECKOUT_DETAILS_TTL_SECONDS : null,
        product: storefront.product,
        recommended_plan: plan,
        estimated_charges: {
          currency: 'MYR',
          sim_fee: storefront.product.price,
          plan_fee: plan?.price ?? 0,
          shipping_fee: null,
          total: null,
          plan_fee_included: Boolean(plan),
          final_total_confirmed_on_website: true,
        },
        order_created: false,
        payment_completed: false,
        customer_action_required: true,
        purchase_policy: { ...purchasePolicy, plan_included: Boolean(plan) },
        next_step: 'Open the private checkout_url to review SIM, optional plan and delivery costs and any prefilled details, complete verification, and authorize payment. The selected plan and paid plan fee are recorded when the order is submitted; plan activation is performed manually by the merchant after SIM registration. Never share a prefilled link. This link does not reserve stock or lock prices.',
      }
    }
    throw new CommerceError('unknown_tool', 'Unknown commerce tool.', 404)
  } catch (error) {
    if (error instanceof CommerceError) throw error
    if (error instanceof z.ZodError) {
      throw new CommerceError('invalid_arguments', 'Invalid tool arguments. Use the published input schema. Only supply customer-authorized contact/shipping details in assisted mode; never send prices, passwords, OTPs or bank/card details.')
    }
    // Keep DB details, secrets, schema errors and stack traces out of public
    // tool responses. A broken catalogue/DB must not advertise stale defaults.
    throw new CommerceError('service_unavailable', 'Current catalogue or checkout information is temporarily unavailable.', 503)
  }
}
