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

/** Lowercase, strip punctuation/apostrophes, collapse spaces */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')          // curly and straight apostrophes
    .replace(/[^a-z0-9\s]/g, ' ') // all other punctuation → space
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Expand common abbreviations so that e.g. "UConn" and "Connecticut" both
 * become "connecticut", and "Saint Mary's" / "St. Mary's" both become
 * "saint marys".
 */
function expand(name: string): string {
  return normalize(name)
    .replace(/\buconn\b/g, 'connecticut')
    .replace(/\bunc\b/g, 'north carolina')
    .replace(/\bst\b/g, 'saint')   // must come after uconn/unc replacements
}

/**
 * Returns true when the Odds API team name fuzzy-matches any name in dbNames.
 * Strategies (in order):
 *   1. Exact match after expansion
 *   2. One expanded name is a substring of the other (handles e.g. "Omaha"
 *      in "Nebraska Omaha")
 *   3. Token overlap — at least ⌈60 %⌉ of the shorter name's meaningful
 *      tokens (length ≥ 4) appear in the other name
 */
function matchesAnyTeam(oddsName: string, dbNames: string[]): boolean {
  const e1 = expand(oddsName)
  return dbNames.some(dbName => {
    const e2 = expand(dbName)
    if (e1 === e2) return true
    if (e1.includes(e2) || e2.includes(e1)) return true

    const tokens1 = e1.split(' ').filter(t => t.length >= 4)
    const tokens2 = e2.split(' ').filter(t => t.length >= 4)
    if (tokens1.length === 0 || tokens2.length === 0) return false

    const overlap = tokens1.filter(t => tokens2.includes(t))
    const minLen = Math.min(tokens1.length, tokens2.length)
    return overlap.length >= Math.ceil(minLen * 0.6)
  })
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

  const url = new URL('https://api.the-odds-api.com/v4/sports/basketball_ncaab/scores/')
  url.searchParams.set('apiKey', apiKey)
  url.searchParams.set('daysFrom', '1')

  // Fetch Odds API data and tournament teams in parallel
  const supabase = await createClient()
  let oddsRes: Response
  let teamsData: { name: string }[] | null = null
  try {
    ;[oddsRes, { data: teamsData }] = await Promise.all([
      fetch(url.toString()),
      supabase.from('teams').select('name'),
    ])
  } catch {
    return NextResponse.json({ error: 'Failed to reach The Odds API' }, { status: 502 })
  }

  if (!oddsRes.ok) {
    const body = await oddsRes.text()
    return NextResponse.json(
      { error: `Odds API returned ${oddsRes.status}: ${body}` },
      { status: oddsRes.status }
    )
  }

  const data: OddsGame[] = await oddsRes.json()
  const remainingRequests = oddsRes.headers.get('x-requests-remaining')
  const usedRequests = oddsRes.headers.get('x-requests-used')

  // If the DB fetch failed or teams aren't seeded yet, return all games
  // (graceful degradation so scores work even if Supabase is unreachable)
  const dbNames: string[] = teamsData?.map(t => t.name) ?? []

  const games =
    dbNames.length === 0
      ? data // fallback: DB not seeded yet, show everything
      : data.filter(
          game =>
            matchesAnyTeam(game.home_team, dbNames) ||
            matchesAnyTeam(game.away_team, dbNames)
        )

  return NextResponse.json({ games, remainingRequests, usedRequests })
}
