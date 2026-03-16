import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  // Fetch all three sources in parallel
  const supabase = await createClient()
  let scoresRes: Response
  let eventsRes: Response
  let teamsData: { name: string }[] | null = null

  try {
    ;[scoresRes, eventsRes, { data: teamsData }] = await Promise.all([
      fetch(scoresUrl.toString()),
      fetch(eventsUrl.toString()),
      supabase.from('teams').select('name'),
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
  // Use quota headers from the scores call (both calls consume quota)
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

  // Merge: scores data takes precedence (has live/final info); events fills in
  // upcoming games not yet in the scores feed. Deduplicate by id.
  const seen = new Set<string>()
  const merged: OddsGame[] = []
  for (const game of [...scoresData, ...eventsData]) {
    if (!seen.has(game.id)) {
      seen.add(game.id)
      merged.push(game)
    }
  }

  const dbNames: string[] = teamsData?.map(t => t.name) ?? []
  const games = merged.filter(game => isTournamentGame(game, dbNames))

  return NextResponse.json({ games, remainingRequests, usedRequests })
}
