import { getSetting, updateSetting } from '@/lib/queries/settings'
import defaultCatalogue from '@/public/recommender/catalogue.json'
import { validateCatalogue, type Catalogue } from '@/public/recommender/engine.mjs'
import { PLAN_RECOMMENDER_SETTING_KEY } from '@/lib/plan-recommender-key'

export { PLAN_RECOMMENDER_SETTING_KEY } from '@/lib/plan-recommender-key'

/** Both sites read this existing settings row on every request. */
export async function getPlanCatalogue(): Promise<Catalogue> {
  const saved = await getSetting(PLAN_RECOMMENDER_SETTING_KEY)
  const catalogue: unknown = saved === null ? defaultCatalogue : JSON.parse(saved)
  // Only an absent setting uses defaults. Corrupt settings and DB outages fail
  // closed, so an old/default plan cannot be advertised as available.
  if (!validateCatalogue(catalogue)) throw new Error('Invalid plan catalogue')
  return catalogue
}

export async function savePlanCatalogue(catalogue: Catalogue): Promise<void> {
  if (!validateCatalogue(catalogue)) throw new Error('Invalid plan catalogue')
  await updateSetting(PLAN_RECOMMENDER_SETTING_KEY, JSON.stringify(catalogue))
}
