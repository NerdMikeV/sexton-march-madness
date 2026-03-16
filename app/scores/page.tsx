'use client'

import { useEffect, useState, useCallback } from 'react'

interface ScoreEntry {
  name: string
  score: string | null
}

interface Game {
  id: string
  commence_time: string
  completed: boolean
  home_team: string
  away_team: string
  scores: ScoreEntry[] | null
  last_update: string | null
}

type GameStatus = 'final' | 'live' | 'upcoming'

function getStatus(game: Game): GameStatus {
  if (game.completed) return 'final'
  if (game.scores && game.scores.some(s => s.score !== null)) return 'live'
  return 'upcoming'
}

function getScore(game: Game, teamName: string): string {
  if (!game.scores) return '-'
  const entry = game.scores.find(s => s.name === teamName)
  return entry?.score ?? '-'
}

function isWinner(game: Game, teamName: string): boolean {
  if (!game.completed || !game.scores) return false
  const home = game.scores.find(s => s.name === game.home_team)
  const away = game.scores.find(s => s.name === game.away_team)
  if (!home?.score || !away?.score) return false
  const homeScore = parseInt(home.score)
  const awayScore = parseInt(away.score)
  if (teamName === game.home_team) return homeScore > awayScore
  return awayScore > homeScore
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function StatusBadge({ status }: { status: GameStatus }) {
  if (status === 'final') {
    return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/50">FINAL</span>
  }
  if (status === 'live') {
    return (
      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
        LIVE
      </span>
    )
  }
  return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">UPCOMING</span>
}

function GameCard({ game }: { game: Game }) {
  const status = getStatus(game)
  const homeScore = getScore(game, game.home_team)
  const awayScore = getScore(game, game.away_team)
  const homeWon = isWinner(game, game.home_team)
  const awayWon = isWinner(game, game.away_team)

  return (
    <div className={`bg-white/3 border rounded-2xl p-4 transition-colors ${
      status === 'live' ? 'border-green-500/30' : 'border-white/10'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <StatusBadge status={status} />
        <span className="text-white/30 text-xs">
          {status === 'upcoming' ? formatTime(game.commence_time) : formatDate(game.commence_time)}
        </span>
      </div>

      {/* Away team */}
      <div className="flex items-center justify-between py-2">
        <span className={`text-sm font-medium flex-1 mr-2 ${
          status === 'final' && !awayWon ? 'text-white/40' : 'text-white'
        }`}>
          {game.away_team}
          {awayWon && <span className="ml-1.5 text-amber-400 text-xs">▲</span>}
        </span>
        <span className={`font-bebas text-2xl w-10 text-right tabular-nums ${
          awayWon ? 'text-amber-400' : status === 'final' ? 'text-white/40' : 'text-white'
        }`}>
          {awayScore}
        </span>
      </div>

      <div className="border-t border-white/5" />

      {/* Home team */}
      <div className="flex items-center justify-between py-2">
        <span className={`text-sm font-medium flex-1 mr-2 ${
          status === 'final' && !homeWon ? 'text-white/40' : 'text-white'
        }`}>
          {game.home_team}
          {homeWon && <span className="ml-1.5 text-amber-400 text-xs">▲</span>}
        </span>
        <span className={`font-bebas text-2xl w-10 text-right tabular-nums ${
          homeWon ? 'text-amber-400' : status === 'final' ? 'text-white/40' : 'text-white'
        }`}>
          {homeScore}
        </span>
      </div>

      {game.last_update && status === 'live' && (
        <div className="text-white/20 text-xs mt-1 text-right">
          Updated {new Date(game.last_update).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </div>
      )}
    </div>
  )
}

export default function ScoresPage() {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [quota, setQuota] = useState<{ remaining: string | null; used: string | null }>({ remaining: null, used: null })
  const [filter, setFilter] = useState<'all' | 'live' | 'final' | 'upcoming'>('all')

  const fetchScores = useCallback(async () => {
    try {
      const res = await fetch('/api/scores')
      console.log('[scores] fetch status:', res.status, res.ok)
      const json = await res.json()
      console.log('[scores] json keys:', Object.keys(json))
      console.log('[scores] json.games type:', typeof json.games, Array.isArray(json.games))
      console.log('[scores] json.games length:', json.games?.length)
      console.log('[scores] first game sample:', json.games?.[0])
      if (!res.ok) {
        console.log('[scores] error response:', json)
        setError(json.error || 'Failed to load scores')
        return
      }
      setGames(json.games || [])
      setLastFetched(new Date())
      setQuota({
        remaining: json.remainingRequests,
        used: json.usedRequests,
      })
      setError('')
    } catch (err) {
      console.error('[scores] fetch threw:', err)
      setError('Network error — could not reach scores API')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchScores()
    // Auto-refresh every 60s
    const interval = setInterval(fetchScores, 60_000)
    return () => clearInterval(interval)
  }, [fetchScores])

  const filteredGames = games.filter(g => {
    if (filter === 'all') return true
    return getStatus(g) === filter
  })

  // Group by status for "all" view: live first, then upcoming, then final
  const sortedGames = filter === 'all'
    ? [
        ...filteredGames.filter(g => getStatus(g) === 'live'),
        ...filteredGames.filter(g => getStatus(g) === 'upcoming'),
        ...filteredGames.filter(g => getStatus(g) === 'final'),
      ]
    : filteredGames

  const liveCount = games.filter(g => getStatus(g) === 'live').length
  const finalCount = games.filter(g => getStatus(g) === 'final').length
  const upcomingCount = games.filter(g => getStatus(g) === 'upcoming').length

  console.log('[scores] render — games:', games.length, 'sorted:', sortedGames.length, 'loading:', loading, 'error:', error)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-bebas text-5xl tracking-widest text-white mb-1">
          LIVE <span className="text-amber-400">SCORES</span>
        </h1>
        <p className="text-white/40 text-sm">NCAA Men&apos;s Basketball · Powered by The Odds API</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Live', value: liveCount, color: 'text-green-400' },
          { label: 'Upcoming', value: upcomingCount, color: 'text-amber-400' },
          { label: 'Final', value: finalCount, color: 'text-white/50' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white/3 border border-white/10 rounded-xl p-3 text-center">
            <div className={`font-bebas text-2xl ${color}`}>{loading ? '–' : value}</div>
            <div className="text-white/40 text-xs">{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['all', 'live', 'upcoming', 'final'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              filter === f ? 'bg-amber-500 text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            {f === 'all' ? `All (${games.length})` : f === 'live' ? `Live (${liveCount})` : f === 'final' ? `Final (${finalCount})` : `Upcoming (${upcomingCount})`}
          </button>
        ))}
        <button
          onClick={() => { setLoading(true); fetchScores() }}
          className="ml-auto px-4 py-1.5 rounded-lg text-sm text-white/40 hover:text-white border border-white/10 hover:border-white/20 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center mb-6">
          <div className="text-red-400 font-medium mb-1">Failed to load scores</div>
          <div className="text-red-400/60 text-sm">{error}</div>
          {error.includes('ODDS_API_KEY') && (
            <div className="mt-3 text-white/40 text-xs">
              Add your API key to <code className="bg-white/10 px-1 rounded">.env.local</code> as{' '}
              <code className="bg-white/10 px-1 rounded">ODDS_API_KEY</code>
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !error && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white/3 border border-white/10 rounded-2xl p-4 animate-pulse h-36" />
          ))}
        </div>
      )}

      {/* No games */}
      {!loading && !error && sortedGames.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🏀</div>
          <div className="text-white/40 font-medium">No games found</div>
          <div className="text-white/20 text-sm mt-1">
            {filter === 'all' ? 'No NCAAB games in the past 24 hours' : `No ${filter} games right now`}
          </div>
        </div>
      )}

      {/* Games grid */}
      {!loading && !error && sortedGames.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedGames.map(game => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}

      {/* Footer — quota + last updated */}
      {(lastFetched || quota.remaining) && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-2 text-white/20 text-xs border-t border-white/5 pt-4">
          {lastFetched && (
            <span>Last updated {lastFetched.toLocaleTimeString()} · auto-refreshes every 60s</span>
          )}
          {quota.remaining && (
            <span>API quota: {quota.used} used · {quota.remaining} remaining</span>
          )}
        </div>
      )}
    </div>
  )
}
