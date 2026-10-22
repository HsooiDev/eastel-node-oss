import { validateCatalogue, type RecommendationPlan } from '@/public/recommender/engine.mjs'

/** The plan's terms at checkout. Later catalogue edits must not change an order. */
export type OrderPlan = Readonly<RecommendationPlan>
export type OrderPlanSnapshot = {
  readonly version: 1
  readonly currency: 'MYR'
  readonly plan: OrderPlan
}

export function createOrderPlanSnapshot(plan: RecommendationPlan): OrderPlanSnapshot {
  return Object.freeze({ version: 1, currency: 'MYR', plan: Object.freeze({ ...plan }) })
}

/** Read persisted snapshots without consulting today's catalogue or prices. */
export function getOrderPlanSnapshot(raw: unknown): OrderPlanSnapshot | null {
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const candidate = value as Record<string, unknown>
    if (Object.keys(candidate).some(key => !['version', 'currency', 'plan'].includes(key)) || candidate.version !== 1 || candidate.currency !== 'MYR') return null
    const catalogue = { version: 1, plans: [candidate.plan] }
    if (!validateCatalogue(catalogue)) return null
    // Only available plans can be purchased; the snapshot retains that state.
    const plan = catalogue.plans[0]
    return plan.status === 'available' ? createOrderPlanSnapshot(plan) : null
  } catch {
    return null
  }
}
