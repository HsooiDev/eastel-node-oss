import { z } from 'zod'
import { commerceSchemas, commerceToolDescriptions } from '@/lib/ai-commerce'
import { commerceHttpError, commerceJson, commerceRateLimit, commerceRateLimitError } from '@/lib/ai-commerce-http'
import { SITE_URL } from '@/lib/site'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const product = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  price: z.number().nonnegative().describe('Physical SIM price in MYR; excludes shipping and mobile plan fees.'),
  available: z.boolean(),
})

const plan = z.object({
  id: z.string(), name: z.string(), price: z.number().nonnegative(),
  dataGB: z.number().nonnegative(), hotspotGB: z.number().nonnegative(),
  hotspotMode: z.enum(['shared', 'separate']), roamingGB: z.number().nonnegative(),
  validityDays: z.number().int().positive(),
  status: z.enum(['available', 'coming_soon', 'inactive']),
})

const purchasePolicy = z.object({
  purchasable_item: z.literal('one_physical_prepaid_sim'),
  quantity: z.literal(1), currency: z.literal('MYR'),
  plan_included: z.boolean(), plan_purchase_optional: z.literal(true), plan_activation: z.string(), shipping: z.string(),
  customer_confirmation_required: z.literal(true),
})

const catalogueResult = z.object({
  status: z.literal('success'), currency: z.literal('MYR'),
  product: product.nullable(), plans: z.array(plan), checkout_available: z.boolean(),
  purchase_policy: purchasePolicy, checkout_url: z.url().nullable(),
})

const recommendationResult = z.object({
  status: z.literal('success'), currency: z.literal('MYR'),
  recommendation: z.object({
    status: z.enum(['invalid', 'no_match', 'match', 'over_budget']),
    plan: plan.nullable(),
    shortfall: z.number().nonnegative().describe('Amount by which the plan alone exceeds the requested budget, in MYR.'),
    gaps: z.object({
      dataGB: z.number().nonnegative(), hotspotGB: z.number().nonnegative(),
      roamingGB: z.number().nonnegative(), validityDays: z.number().nonnegative(),
      sharedDataGB: z.number().nonnegative(),
    }).nullable(),
  }),
  plan_budget_excludes_sim_and_shipping: z.literal(true), purchase_policy: purchasePolicy,
})

const checkoutResult = z.object({
  status: z.literal('success'),
  checkout_url: z.url().describe('Customer checkout link. An assisted prefill link may contain a sensitive encrypted fragment; never log or share it publicly.'),
  checkout_mode: z.enum(['assisted', 'website']), details_prefilled: z.boolean(),
  purchase_option: z.enum(['sim_only', 'sim_and_plan']),
  details_expire_in_seconds: z.number().int().positive().nullable().describe('Prefill link validity in seconds; null when no customer details were supplied.'),
  customer_action_required: z.literal(true),
  product, recommended_plan: plan.nullable(),
  estimated_charges: z.object({
    currency: z.literal('MYR'), sim_fee: z.number().nonnegative(), plan_fee: z.number().nonnegative(),
    shipping_fee: z.null(), total: z.null(), plan_fee_included: z.boolean(),
    final_total_confirmed_on_website: z.literal(true),
  }),
  order_created: z.literal(false), payment_completed: z.literal(false),
  purchase_policy: purchasePolicy, next_step: z.string(),
})

const errorResult = z.object({
  status: z.literal('error'), code: z.string(), message: z.string(),
})

const schemaRef = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const jsonContent = (name: string) => ({ 'application/json': { schema: schemaRef(name) } })
const responseHeaders = {
  'Cache-Control': { description: 'Always no-store.', schema: { type: 'string' } },
  'X-RateLimit-Remaining': { description: 'Requests remaining in this process-local one-minute window.', schema: { type: 'integer' } },
  'X-RateLimit-Reset': { description: 'Window reset time as Unix seconds.', schema: { type: 'integer' } },
}

function responses(successSchema: string, statuses: number[]) {
  const descriptions: Record<number, string> = {
    400: 'Invalid arguments or malformed JSON; use only the published fields.',
    403: 'Browser Origin does not match the configured Eastel site.',
    409: 'SIM checkout or the requested plan is currently unavailable.',
    413: 'Request body exceeds 16 KiB.',
    415: 'Request Content-Type must be application/json.',
    429: 'Rate limit exceeded; retry after Retry-After seconds.',
    503: 'Current catalogue or checkout information is temporarily unavailable.',
  }
  return {
    '200': { description: 'Successful response; no order or payment is created.', content: jsonContent(successSchema), headers: responseHeaders },
    ...Object.fromEntries(statuses.map(status => [String(status), {
      description: descriptions[status], content: jsonContent('CommerceError'),
      headers: status === 429
        ? { ...responseHeaders, 'Retry-After': { schema: { type: 'integer' }, description: 'Seconds before retrying.' } }
        : responseHeaders,
    }])),
  }
}

export async function GET(request: Request) {
  const rateLimit = commerceRateLimit(request)
  if (!rateLimit.allowed) return commerceRateLimitError(rateLimit)
  try {
    const catalogueInput = z.toJSONSchema(commerceSchemas.eastel_get_catalogue, { io: 'input' })
    const origin = new URL(SITE_URL).origin
    return commerceJson({
      openapi: '3.1.0',
      info: {
        title: 'Eastel AI SIM Shopping', version: '1.0.0',
        description: 'Read live mobile plan information, recommend a plan, and prepare a checkout link for one physical Eastel SIM. Assisted checkout can prefill customer-authorized contact and shipping details. The customer reviews final charges, completes verification and authorizes payment on Eastel/payment pages. Mobile plans are activated separately. These API calls create no order, charge or reservation. Never send passwords, OTPs, card data or bank credentials.',
        contact: { url: `${origin}/en/contact` },
      },
      servers: [{ url: origin, description: 'Configured Eastel site origin' }],
      security: [],
      paths: {
        '/api/ai/catalogue': {
          get: {
            operationId: 'eastel_get_catalogue', summary: 'Read current SIM and available mobile plans',
            description: commerceToolDescriptions.eastel_get_catalogue,
            'x-openai-isConsequential': false,
            parameters: [{ name: 'locale', in: 'query', required: false, schema: catalogueInput.properties?.locale }],
            responses: responses('CatalogueResult', [400, 429, 503]),
          },
        },
        '/api/ai/recommend': {
          post: {
            operationId: 'eastel_recommend_plan', summary: 'Recommend an available mobile plan',
            description: commerceToolDescriptions.eastel_recommend_plan,
            'x-openai-isConsequential': false,
            requestBody: { required: true, content: jsonContent('RecommendPlanInput') },
            responses: responses('RecommendationResult', [400, 403, 413, 415, 429, 503]),
          },
        },
        '/api/ai/checkout': {
          post: {
            operationId: 'eastel_prepare_checkout', summary: 'Prepare a customer-confirmed SIM checkout link',
            description: commerceToolDescriptions.eastel_prepare_checkout,
            'x-openai-isConsequential': false,
            requestBody: { required: true, content: jsonContent('PrepareCheckoutInput') },
            responses: responses('CheckoutResult', [400, 403, 409, 413, 415, 429, 503]),
          },
        },
      },
      components: {
        schemas: {
          CatalogueInput: catalogueInput,
          RecommendPlanInput: z.toJSONSchema(commerceSchemas.eastel_recommend_plan, { io: 'input' }),
          PrepareCheckoutInput: z.toJSONSchema(commerceSchemas.eastel_prepare_checkout, { io: 'input' }),
          CatalogueResult: z.toJSONSchema(catalogueResult),
          RecommendationResult: z.toJSONSchema(recommendationResult),
          CheckoutResult: z.toJSONSchema(checkoutResult),
          CommerceError: z.toJSONSchema(errorResult),
        },
      },
    }, 200, rateLimit)
  } catch (error) {
    return commerceHttpError(error, rateLimit)
  }
}
