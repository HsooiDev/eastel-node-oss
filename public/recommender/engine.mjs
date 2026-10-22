// Identical in PHP /recommender and Node public/recommender. No network or DB access.
export const CATALOGUE_KEY = 'plan_recommender_catalogue_v1';

const CATALOGUE_FIELDS = new Set(['version', 'plans']);
const PLAN_FIELDS = new Set(['id', 'name', 'price', 'dataGB', 'hotspotGB', 'hotspotMode', 'roamingGB', 'validityDays', 'status']);
const finiteQuota = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000;
const validDays = (value) => Number.isInteger(value) && value >= 1 && value <= 366;
const validMoney = (value) => finiteQuota(value) && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
const allowanceCovers = (available, needed) => {
  const tolerance = Number.EPSILON * 16 * Math.max(1, Math.abs(available), Math.abs(needed));
  return available + tolerance >= needed;
};

export function validateCatalogue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || !Array.isArray(value.plans) || value.plans.length > 100) return false;
  if (Object.keys(value).some((key) => !CATALOGUE_FIELDS.has(key))) return false;
  const ids = new Set();
  for (const plan of value.plans) {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan) || Object.keys(plan).some((key) => !PLAN_FIELDS.has(key)) || typeof plan.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(plan.id) || ids.has(plan.id)) return false;
    ids.add(plan.id);
    if (typeof plan.name !== 'string' || !plan.name.trim() || plan.name !== plan.name.trim() || [...plan.name].length > 80) return false;
    if (!validMoney(plan.price) || !finiteQuota(plan.dataGB) || !finiteQuota(plan.hotspotGB) || !finiteQuota(plan.roamingGB) || !validDays(plan.validityDays)) return false;
    if (!['shared', 'separate'].includes(plan.hotspotMode) || !['available', 'coming_soon', 'inactive'].includes(plan.status)) return false;
    if (plan.hotspotMode === 'shared' && plan.hotspotGB > plan.dataGB) return false;
  }
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length <= 65535;
  } catch {
    return false;
  }
}

export function availablePlan(catalogue, id) {
  if (!validateCatalogue(catalogue) || typeof id !== 'string') return null;
  return catalogue.plans.find((plan) => plan.id === id && plan.status === 'available') ?? null;
}

function planGaps(plan, needs) {
  return {
    dataGB: Math.max(0, needs.dataGB - plan.dataGB),
    hotspotGB: Math.max(0, needs.hotspotGB - plan.hotspotGB),
    roamingGB: Math.max(0, needs.roamingGB - plan.roamingGB),
    validityDays: Math.max(0, needs.minValidityDays - plan.validityDays),
    sharedDataGB: plan.hotspotMode === 'shared'
      ? Math.max(0, needs.dataGB + needs.hotspotGB - plan.dataGB)
      : 0,
  };
}

function gapScore(gaps, needs) {
  const ratio = (gap, need) => gap / Math.max(1, Math.abs(need));
  return ratio(gaps.dataGB, needs.dataGB)
    + ratio(gaps.hotspotGB, needs.hotspotGB)
    + ratio(gaps.roamingGB, needs.roamingGB)
    + ratio(gaps.validityDays, needs.minValidityDays)
    + ratio(gaps.sharedDataGB, needs.dataGB + needs.hotspotGB);
}

function gapCount(gaps) {
  return Object.values(gaps).filter((gap) => gap > 0).length;
}

export function recommend(catalogue, needs) {
  const result = (status, plan = null, shortfall = 0, gaps = null) => ({ status, plan, shortfall, gaps });
  if (!validateCatalogue(catalogue) || !needs || !finiteQuota(needs.dataGB) || !finiteQuota(needs.hotspotGB) || !finiteQuota(needs.roamingGB) || !validMoney(needs.budget) || !validDays(needs.minValidityDays)) return result('invalid');
  // Phone data excludes hotspot. Shared hotspot consumes the same local allowance.
  const available = catalogue.plans.filter((plan) => plan.status === 'available');
  const candidates = available.filter((plan) =>
    plan.validityDays >= needs.minValidityDays &&
    allowanceCovers(plan.dataGB, needs.dataGB) && allowanceCovers(plan.hotspotGB, needs.hotspotGB) && allowanceCovers(plan.roamingGB, needs.roamingGB) &&
    (plan.hotspotMode !== 'shared' || allowanceCovers(plan.dataGB, needs.dataGB + needs.hotspotGB))
  ).sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!candidates.length) {
    const closest = available.map((plan) => {
      const gaps = planGaps(plan, needs);
      return { plan, gaps, score: gapScore(gaps, needs), count: gapCount(gaps) };
    }).sort((a, b) => a.score - b.score || a.count - b.count || a.plan.price - b.plan.price || (a.plan.id < b.plan.id ? -1 : a.plan.id > b.plan.id ? 1 : 0))[0];
    if (!closest) return result('no_match');
    const shortfall = Math.max(0, Math.round(closest.plan.price * 100) - Math.round(needs.budget * 100)) / 100;
    return result('no_match', closest.plan, shortfall, closest.gaps);
  }
  const plan = candidates[0];
  const shortfall = Math.max(0, Math.round(plan.price * 100) - Math.round(needs.budget * 100)) / 100;
  return result(shortfall ? 'over_budget' : 'match', plan, shortfall);
}
