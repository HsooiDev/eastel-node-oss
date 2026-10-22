export interface RecommendationPlan {
  id: string; name: string; price: number; dataGB: number; hotspotGB: number;
  hotspotMode: 'shared' | 'separate'; roamingGB: number; validityDays: number;
  status: 'available' | 'coming_soon' | 'inactive';
}
export interface Catalogue { version: 1; plans: RecommendationPlan[] }
export interface Needs { dataGB: number; hotspotGB: number; roamingGB: number; budget: number; minValidityDays: number; hotspotSpecified?: boolean; roamingSpecified?: boolean }
export interface RecommendationGaps { dataGB: number; hotspotGB: number; roamingGB: number; validityDays: number; sharedDataGB: number }
export const CATALOGUE_KEY: string;
export function validateCatalogue(value: unknown): value is Catalogue;
export function availablePlan(catalogue: unknown, id: unknown): RecommendationPlan | null;
export function recommend(catalogue: unknown, needs: Needs): { status: 'invalid' | 'no_match' | 'match' | 'over_budget'; plan: RecommendationPlan | null; shortfall: number; gaps: RecommendationGaps | null };
