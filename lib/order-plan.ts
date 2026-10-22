import { getPlanCatalogue } from '@/lib/plan-recommender'
import { availablePlan } from '@/public/recommender/engine.mjs'
import { createOrderPlanSnapshot, type OrderPlanSnapshot } from '@/lib/order-plan-snapshot'

export { getOrderPlanSnapshot } from '@/lib/order-plan-snapshot'
export type { OrderPlan, OrderPlanSnapshot } from '@/lib/order-plan-snapshot'

export class OrderPlanSelectionError extends Error {
  constructor(message: string, public readonly httpStatus = 400) {
    super(message)
    this.name = 'OrderPlanSelectionError'
  }
}

/** Resolve only a catalogue ID. Customer-supplied names, terms or prices are ignored. */
export async function resolveOrderPlanSelection(planId: unknown): Promise<{ snapshot: OrderPlanSnapshot | null; fee: number }> {
  if (planId === undefined || planId === null || planId === '') return { snapshot: null, fee: 0 }
  if (typeof planId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(planId)) {
    throw new OrderPlanSelectionError('Invalid mobile plan selection.')
  }
  const plan = availablePlan(await getPlanCatalogue(), planId)
  if (!plan) {
    throw new OrderPlanSelectionError('The selected mobile plan is no longer available. Please choose again or select SIM only.', 409)
  }
  return { snapshot: createOrderPlanSnapshot(plan), fee: plan.price }
}
