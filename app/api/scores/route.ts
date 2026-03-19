import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Force dynamic so env vars are read fresh on every request (no build-time cache)
export const dynamic = 'force-dynamic'

export interface OddsGame {
  id: string
  sport_key: string
  sport_title: string
  commence_time: string
  completed: boolean
  home_team: string
  away_team: string
  scores: { name: string; score: string }[] | null
  last_update: string | null
}

type DBTeam = { id: string; name: string; seed: number; region: string }

// ── Fuzzy matching helpers ────────────────────────────────────────────────────

/** Lowercase, strip apostrophes and punctuation, collapse spaces */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')          // curly and straight apostrophes
    .replace(/[^a-z0-9\s]/g, ' ') // all other punctuation → space
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Expand abbreviations and alternate names to canonical forms so that both
 * the DB name and the Odds API name produce the same string before matching.
 *
 * Rules are applied in this order:
 *   1. Multi-word phrases (longest first, before single-word rules fire)
 *   2. Single-word abbreviations
 *   3. "st" context rule: leading → "saint", elsewhere → "state"
 *
 * Both sides of the comparison go through expand(), so it doesn't matter
 * which direction an alias runs as long as both names resolve to the same
 * canonical string.
 */
function expand(name: string): string {
  let s = normalize(name)

  // ── 1. Multi-word phrase aliases ────────────────────────────────────────
  s = s.replace(/\bsouthern illinois edwardsville\b/g, 'siu edwardsville')
  s = s.replace(/\bvirginia commonwealth\b/g, 'vcu')
  s = s.replace(/\bbrigham young\b/g, 'byu')
  s = s.replace(/\bsouthern methodist\b/g, 'smu')
  s = s.replace(/\bcentral florida\b/g, 'ucf')
  s = s.replace(/\bnorthern iowa\b/g, 'uni')
  s = s.replace(/\blong island\b/g, 'liu')           // Long Island University → LIU
  s = s.replace(/\bnebraska omaha\b/g, 'omaha')      // Nebraska Omaha → Omaha
  s = s.replace(/\bmiami fl\b/g, 'miami')            // strips (FL) qualifier
  s = s.replace(/\bmiami oh\b/g, 'miamioh')          // Miami (OH) → distinct token, won't prefix-match "miami"
  s = s.replace(/\bprairie view a m\b/g, 'prairie view') // A&M normalizes to "a m"

  // ── 2. Single-word abbreviations ────────────────────────────────────────
  s = s.replace(/\buconn\b/g, 'connecticut')
  s = s.replace(/\buncw\b/g, 'north carolina wilmington') // before \bunc\b
  s = s.replace(/\bunc\b/g, 'north carolina')
  s = s.replace(/\bpenn\b/g, 'pennsylvania')         // Penn Quakers → Pennsylvania

  // ── 3. "st" context rule ────────────────────────────────────────────────
  s = s.replace(/^st\b/, 'saint')   // leading "st" → saint  (St. John's, St. Mary's)
  s = s.replace(/\bst\b/g, 'state') // elsewhere  → state   (Michigan St, Iowa St)

  return s
}

/**
 * Check whether the Odds API name (which includes the mascot, e.g.
 * "Duke Blue Devils") matches a single DB name (e.g. "Duke").
 *
 * Strategy: after expansion, the Odds API name should START WITH the DB name.
 * This strips mascots implicitly and avoids false positives like
 * "South Alabama Jaguars" matching DB "Alabama" (because
 * "south alabama jaguars" does NOT start with "alabama").
 *
 * For play-in entries stored as "TeamA/TeamB" in the DB, each half is
 * checked separately.
 */
function matchesDbName(oddsExpanded: string, dbName: string): boolean {
  // Handle play-in pairs like "UMBC/Howard"
  const parts = dbName.split('/')
  return parts.some(part => {
    const e = expand(part.trim())
    // Check both directions: Odds API name may be longer (has mascot) OR
    // shorter (uses abbreviation) than the DB name after expansion.
    return oddsExpanded === e
      || oddsExpanded.startsWith(e + ' ')
      || e.startsWith(oddsExpanded + ' ')
  })
}

function matchesAnyTeam(oddsName: string, dbNames: string[]): boolean {
  const e1 = expand(oddsName)
  return dbNames.some(dbName => matchesDbName(e1, dbName))
}

function isTournamentGame(game: OddsGame, dbNames: string[]): boolean {
  if (dbNames.length === 0) return true
  return (
    matchesAnyTeam(game.home_team, dbNames) &&
    matchesAnyTeam(game.away_team, dbNames)
  )
}

/** Find the DB team record whose name matches a given Odds API team name. */
function findTeam(oddsName: string, teams: DBTeam[]): DBTeam | undefined {
  const e1 = expand(oddsName)
  return teams.find(t => matchesDbName(e1, t.name))
}

// ── Round determination ───────────────────────────────────────────────────────

/**
 * Map a game's commence_time to a contest round number.
 * Returns 0 for First Four (play-in), 1–6 for scored rounds, null if unknown.
 *
 * Dates are checked in Eastern Time (UTC-4 after DST on March 8) so that a
 * game tipping off at 9 pm ET on March 18 is not misread as March 19 in UTC.
 */
function getRound(commenceTime: string): number | null {
  const d = new Date(commenceTime)
  // Convert to ET (EDT = UTC-4 throughout the tournament after March 8 DST)
  const et = new Date(d.getTime() - 4 * 60 * 60 * 1000)
  const month = et.getUTCMonth() + 1 // 1-indexed
  const day = et.getUTCDate()

  if (month === 3 && (day === 17 || day === 18)) return 0 // First Four (play-in)
  if (month === 3 && (day === 19 || day === 20)) return 1 // Round of 64
  if (month === 3 && (day === 21 || day === 22)) return 2 // Round of 32
  if (month === 3 && (day === 26 || day === 27)) return 3 // Sweet 16
  if (month === 3 && (day === 28 || day === 29)) return 4 // Elite 8
  if (month === 4 && day === 4)                 return 5 // Final Four
  if (month === 4 && day === 6)                 return 6 // Championship
  return null
}

// ── Auto-grading ──────────────────────────────────────────────────────────────

/**
 * For every completed tournament game, insert a game_result row and mark the
 * losing team as eliminated — unless the result already exists.
 *
 * First Four games (round 0): don't insert a game_result. If the DB team has
 * a slash name (e.g. "UMBC/Howard"), resolve it to just the winner's name.
 *
 * Uses the Supabase service-role key so writes bypass RLS.
 */
async function autoGradeGames(games: OddsGame[], teams: DBTeam[]) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!serviceKey || !supabaseUrl) return

  const admin = createServiceClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  // Only care about completed games that have scores
  const completed = games.filter(g => g.completed && g.scores && g.scores.length > 0)
  if (completed.length === 0) return

  // Fetch all existing results once to avoid per-game round-trip checks
  const { data: existingResults } = await admin
    .from('game_results')
    .select('winning_team_id, round')

  const alreadyGraded = new Set(
    (existingResults ?? []).map(r => `${r.winning_team_id}:${r.round}`)
  )

  for (const game of completed) {
    const round = getRound(game.commence_time)
    if (round === null) continue

    // Resolve winner and loser from scores
    const homeEntry = game.scores!.find(s => s.name === game.home_team)
    const awayEntry = game.scores!.find(s => s.name === game.away_team)
    if (!homeEntry?.score || !awayEntry?.score) continue

    const homeScore = parseInt(homeEntry.score, 10)
    const awayScore = parseInt(awayEntry.score, 10)
    if (isNaN(homeScore) || isNaN(awayScore) || homeScore === awayScore) continue

    const winnerName = homeScore > awayScore ? game.home_team : game.away_team
    const loserName  = homeScore > awayScore ? game.away_team : game.home_team

    const winnerTeam = findTeam(winnerName, teams)
    const loserTeam  = findTeam(loserName, teams)
    if (!winnerTeam || !loserTeam) continue

    if (round === 0) {
      // First Four: resolve slash-pair team names, mark loser eliminated
      const slashTeam = teams.find(t => t.name.includes('/') && matchesDbName(expand(loserName), t.name))
      if (slashTeam) {
        await admin.from('teams').update({ name: winnerTeam.name }).eq('id', slashTeam.id)
        console.log(`[auto-grade] First Four resolved: ${slashTeam.name} → ${winnerTeam.name}`)
      }
      // Mark the losing DB team eliminated (if it's a distinct record)
      if (!slashTeam || loserTeam.id !== slashTeam.id) {
        await admin.from('teams').update({ is_eliminated: true }).eq('id', loserTeam.id)
      }
      continue
    }

    // Skip if already recorded
    const key = `${winnerTeam.id}:${round}`
    if (alreadyGraded.has(key)) continue

    // Insert game result
    const { error: insertErr } = await admin.from('game_results').insert({
      winning_team_id: winnerTeam.id,
      losing_team_id:  loserTeam.id,
      round,
    })
    if (insertErr) {
      // Unique-violation just means a concurrent request beat us — not an error
      if (!insertErr.message.includes('unique') && insertErr.code !== '23505') {
        console.error(`[auto-grade] insert error for ${winnerTeam.name} R${round}:`, insertErr.message)
      }
      continue
    }

    // Mark loser eliminated
    await admin.from('teams').update({ is_eliminated: true }).eq('id', loserTeam.id)

    alreadyGraded.add(key) // prevent double-insert within same request
    console.log(`[auto-grade] R${round}: ${winnerTeam.name} def. ${loserTeam.name}`)
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY?.trim()

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'ODDS_API_KEY is not set. Add your key to .env.local as ODDS_API_KEY=your_key_here and restart the dev server.',
      },
      { status: 500 }
    )
  }

  const scoresUrl = new URL('https://api.the-odds-api.com/v4/sports/basketball_ncaab/scores/')
  scoresUrl.searchParams.set('apiKey', apiKey)
  scoresUrl.searchParams.set('daysFrom', '1')

  const eventsUrl = new URL('https://api.the-odds-api.com/v4/sports/basketball_ncaab/events/')
  eventsUrl.searchParams.set('apiKey', apiKey)

  // Fetch Odds API data and tournament teams in parallel
  const supabase = await createClient()
  let scoresRes: Response
  let eventsRes: Response
  let teamsData: DBTeam[] | null = null

  try {
    ;[scoresRes, eventsRes, { data: teamsData }] = await Promise.all([
      fetch(scoresUrl.toString()),
      fetch(eventsUrl.toString()),
      supabase.from('teams').select('id, name, seed, region'),
    ])
  } catch {
    return NextResponse.json({ error: 'Failed to reach The Odds API' }, { status: 502 })
  }

  if (!scoresRes.ok) {
    const body = await scoresRes.text()
    return NextResponse.json(
      { error: `Odds API returned ${scoresRes.status}: ${body}` },
      { status: scoresRes.status }
    )
  }

  const scoresData: OddsGame[] = await scoresRes.json()
  const remainingRequests = scoresRes.headers.get('x-requests-remaining')
  const usedRequests = scoresRes.headers.get('x-requests-used')

  // Events endpoint returns objects without scores/completed — normalise to OddsGame shape
  let eventsData: OddsGame[] = []
  if (eventsRes.ok) {
    const raw: Omit<OddsGame, 'completed' | 'scores' | 'last_update'>[] = await eventsRes.json()
    eventsData = raw.map(e => ({
      ...e,
      completed: false,
      scores: null,
      last_update: null,
    }))
  }

  // Merge: scores data takes precedence; events fills in upcoming games
  const seen = new Set<string>()
  const merged: OddsGame[] = []
  for (const game of [...scoresData, ...eventsData]) {
    if (!seen.has(game.id)) {
      seen.add(game.id)
      merged.push(game)
    }
  }

  const dbNames: string[] = (teamsData ?? []).map(t => t.name)
  const games = merged.filter(game => isTournamentGame(game, dbNames))

  // Auto-grade completed games — runs synchronously before responding so the
  // leaderboard is up-to-date by the time the client re-fetches it.
  try {
    await autoGradeGames(games, teamsData ?? [])
  } catch (err) {
    console.error('[auto-grade] unexpected error:', err)
    // Don't fail the scores response if grading hits an error
  }

  return NextResponse.json({ games, remainingRequests, usedRequests })
}
