import { NextResponse } from 'next/server'

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

  let res: Response
  try {
    res = await fetch(url.toString())
  } catch {
    return NextResponse.json({ error: 'Failed to reach The Odds API' }, { status: 502 })
  }

  if (!res.ok) {
    const body = await res.text()
    return NextResponse.json(
      { error: `Odds API returned ${res.status}: ${body}` },
      { status: res.status }
    )
  }

  const data: OddsGame[] = await res.json()
  const remainingRequests = res.headers.get('x-requests-remaining')
  const usedRequests = res.headers.get('x-requests-used')

  return NextResponse.json({ games: data, remainingRequests, usedRequests })
}
