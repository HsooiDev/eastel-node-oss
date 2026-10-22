export type RegistrationType = 'new' | 'mnp' | 'mix'

export const REGISTRATION_BONUS_TIERS = [
  { min: 1, max: 10, newBonus: 8, mnpBonus: 13 },
  { min: 11, max: 30, newBonus: 9, mnpBonus: 14 },
  { min: 31, max: 50, newBonus: 10, mnpBonus: 15 },
  { min: 51, max: 100, newBonus: 11, mnpBonus: 17 },
  { min: 101, max: 200, newBonus: 13, mnpBonus: 20 },
  { min: 201, max: Infinity, newBonus: 15, mnpBonus: 25 },
] as const

export function getRegistrationEarnings(count: number, type: RegistrationType): number {
  if (count <= 0) return 0
  const tier = REGISTRATION_BONUS_TIERS.find((candidate) => count >= candidate.min && count <= candidate.max)
    ?? REGISTRATION_BONUS_TIERS[REGISTRATION_BONUS_TIERS.length - 1]

  if (type === 'new') return count * tier.newBonus
  if (type === 'mnp') return count * tier.mnpBonus
  return count * (tier.newBonus + tier.mnpBonus) / 2
}
