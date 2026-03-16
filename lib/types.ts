export type Team = {
  id: string
  name: string
  seed: number
  region: string
  is_eliminated: boolean
}

export type Entry = {
  id: string
  participant_name: string
  participant_email: string | null
  paid: boolean
  submitted_at: string
  tiebreaker_total: number | null
}

export type EntryPick = {
  id: string
  entry_id: string
  team_id: string
  team?: Team
}

export type GameResult = {
  id: string
  winning_team_id: string
  losing_team_id: string
  round: number
  entered_at: string
  winning_team?: Team
  losing_team?: Team
}

export type LeaderboardEntry = {
  entry_id: string
  participant_name: string
  paid: boolean
  total_points: number
  total_wins: number
  upset_count: number
  tiebreaker_total: number | null
  submitted_at: string
}

export const ROUND_NAMES: Record<number, string> = {
  1: 'Round of 64',
  2: 'Round of 32',
  3: 'Sweet 16',
  4: 'Elite 8',
  5: 'Final Four',
  6: 'Championship',
}

export const ROUND_POINTS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 6,
  5: 10,
  6: 20,
}
