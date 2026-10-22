export const PLAN_RECOMMENDER_SETTING_KEY = 'plan_recommender_catalogue_v1'

/**
 * MariaDB's default utf8mb4 collations commonly compare setting keys without
 * case, surrounding whitespace, or accents. Keep the generic settings guard
 * consistent with the database key that owns the dedicated plan catalogue
 * editor, even when the application receives a differently-normalized string.
 */
export function isPlanRecommenderSettingKey(value: unknown): boolean {
  return typeof value === 'string'
    && value.normalize('NFKD').replace(/\p{M}/gu, '').trim().toLowerCase() === PLAN_RECOMMENDER_SETTING_KEY
}
