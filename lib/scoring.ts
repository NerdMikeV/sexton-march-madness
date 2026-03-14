import { ROUND_POINTS } from './types'

export function calculatePoints(winningTeamSeed: number, losingTeamSeed: number, round: number) {
  const basePoints = ROUND_POINTS[round]
  const isUpset = winningTeamSeed > losingTeamSeed
  return {
    points: isUpset ? basePoints * 2 : basePoints,
    isUpset,
  }
}

export function validatePicks(picks: { teamId: string; seed: number }[]): { valid: boolean; error?: string } {
  if (picks.length !== 8) {
    return { valid: false, error: `Must pick exactly 8 teams (you have ${picks.length})` }
  }
  const seedCounts = new Map<number, number>()
  for (const pick of picks) {
    const count = (seedCounts.get(pick.seed) || 0) + 1
    if (count > 1) {
      return { valid: false, error: `Cannot pick more than one #${pick.seed} seed` }
    }
    seedCounts.set(pick.seed, count)
  }
  return { valid: true }
}

export function getSeedBadgeColor(seed: number): string {
  if (seed <= 2) return 'bg-amber-500 text-black'
  if (seed <= 4) return 'bg-green-500 text-black'
  if (seed <= 8) return 'bg-blue-500 text-white'
  if (seed <= 12) return 'bg-purple-500 text-white'
  return 'bg-red-500 text-white'
}

export function getPrizeDistribution(entryCount: number) {
  const pot = entryCount * 25
  return {
    pot,
    first: Math.floor(pot * 0.60),
    second: Math.floor(pot * 0.25),
    third: Math.floor(pot * 0.10),
    fourth: Math.floor(pot * 0.05),
  }
}
