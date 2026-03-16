'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { getPrizeDistribution, getSeedBadgeColor } from '@/lib/scoring'
import type { LeaderboardEntry, Team, EntryPick } from '@/lib/types'
import { ROUND_NAMES } from '@/lib/types'
import { disambiguateNames, buildDisplayNameMap } from '@/lib/utils'

type EntryWithDetails = LeaderboardEntry & {
  picks?: (EntryPick & { team: Team; points: number; isUpset: boolean })[]
}

type RemainingTeam = { name: string; seed: number }

function RemainingTeamsLine({ remaining, upsetCount }: { remaining: RemainingTeam[] | null; upsetCount: number }) {
  if (remaining === null) {
    // Still loading — show wins placeholder so layout doesn't jump
    return <div className="text-white/20 text-xs">Loading…</div>
  }
  const count = remaining.length
  return (
    <div className="text-xs mt-0.5 flex flex-wrap items-center gap-x-2">
      {count === 0 ? (
        <span className="text-red-400">0 teams remaining</span>
      ) : (
        <span className="text-white/40">
          <span className="text-white/60 font-medium">{count}</span>
          {' '}team{count !== 1 ? 's' : ''} remaining:{' '}
          {remaining.map((t, i) => (
            <span key={t.seed}>
              {i > 0 && ', '}
              <span className="text-white/55">({t.seed})</span> {t.name}
            </span>
          ))}
        </span>
      )}
      {upsetCount > 0 && (
        <span className="text-purple-400">⚡ {upsetCount} upset{upsetCount > 1 ? 's' : ''}</span>
      )}
    </div>
  )
}

const RANK_STYLES: Record<number, { badge: string; row: string }> = {
  1: { badge: 'bg-amber-500 text-black', row: 'bg-amber-500/5 border-amber-500/20' },
  2: { badge: 'bg-slate-300 text-black', row: 'bg-slate-500/5 border-slate-500/20' },
  3: { badge: 'bg-amber-700 text-white', row: 'bg-amber-700/5 border-amber-700/20' },
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<EntryWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedData, setExpandedData] = useState<Record<string, EntryWithDetails['picks']>>({})
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [entryCount, setEntryCount] = useState(0)
  const [remainingByEntry, setRemainingByEntry] = useState<Record<string, RemainingTeam[]>>({})
  const [picksRevealAt, setPicksRevealAt] = useState<Date | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [preRevealNames, setPreRevealNames] = useState<{ id: string; participant_name: string }[]>([])

  const fetchLeaderboard = useCallback(async () => {
    const res = await fetch('/api/leaderboard')
    if (res.ok) {
      const data: LeaderboardEntry[] = await res.json()
      setEntries(data)
      setLastUpdated(new Date())

      // Batch-fetch all picks with team elimination status
      if (data.length > 0) {
        const supabase = createClient()
        const { data: allPicks } = await supabase
          .from('entry_picks')
          .select('entry_id, team:teams(name, seed, is_eliminated)')
          .in('entry_id', data.map(e => e.entry_id))

        if (allPicks) {
          const map: Record<string, RemainingTeam[]> = {}
          for (const pick of allPicks) {
            const team = Array.isArray(pick.team) ? pick.team[0] : pick.team
            if (!team || team.is_eliminated) continue
            if (!map[pick.entry_id]) map[pick.entry_id] = []
            map[pick.entry_id].push({ name: team.name, seed: team.seed })
          }
          // Sort each entry's remaining teams by seed
          for (const id of Object.keys(map)) {
            map[id].sort((a, b) => a.seed - b.seed)
          }
          setRemainingByEntry(map)
        }
      }
    }
  }, [])

  const fetchEntryCount = useCallback(async () => {
    const supabase = createClient()
    const [{ data: entriesData }, { data: revealData }] = await Promise.all([
      supabase.from('entries').select('id, participant_name').order('submitted_at', { ascending: true }),
      supabase.from('settings').select('value').eq('key', 'picks_reveal_at').single(),
    ])
    setEntryCount(entriesData?.length || 0)
    setPreRevealNames(entriesData ?? [])
    if (revealData?.value) {
      const raw = typeof revealData.value === 'string'
        ? revealData.value.replace(/^"|"$/g, '')
        : String(revealData.value)
      setPicksRevealAt(new Date(raw))
    }
  }, [])

  useEffect(() => {
    Promise.all([fetchLeaderboard(), fetchEntryCount()]).then(() => setLoading(false))

    // Realtime subscription
    const supabase = createClient()
    const channel = supabase
      .channel('leaderboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_results' }, () => {
        fetchLeaderboard()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, () => {
        fetchEntryCount()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams' }, () => {
        fetchLeaderboard()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchLeaderboard, fetchEntryCount])

  // Tick clock while waiting for picks reveal
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  async function toggleExpand(entryId: string) {
    if (expandedId === entryId) {
      setExpandedId(null)
      return
    }
    setExpandedId(entryId)
    if (!expandedData[entryId]) {
      // Fetch picks for this entry
      const supabase = createClient()
      const { data: picks } = await supabase
        .from('entry_picks')
        .select('*, team:teams(*)')
        .eq('entry_id', entryId)

      if (picks) {
        // Fetch game results to calculate per-team points
        const teamIds = picks.map((p: EntryPick & { team: Team }) => p.team_id)
        const { data: results } = await supabase
          .from('game_results')
          .select('*, winning_team:teams!game_results_winning_team_id_fkey(*), losing_team:teams!game_results_losing_team_id_fkey(*)')
          .in('winning_team_id', teamIds)

        const enriched = picks.map((pick: EntryPick & { team: Team }) => {
          let points = 0
          let isUpset = false
          if (results) {
            for (const r of results) {
              if (r.winning_team_id === pick.team_id) {
                const roundPoints = [0, 1, 2, 4, 6, 10, 20][r.round]
                const upset = r.winning_team.seed > r.losing_team.seed
                points += upset ? roundPoints * 2 : roundPoints
                if (upset) isUpset = true
              }
            }
          }
          return { ...pick, points, isUpset }
        })

        setExpandedData(prev => ({ ...prev, [entryId]: enriched }))
      }
    }
  }

  const prizes = getPrizeDistribution(entryCount)

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="font-bebas text-5xl tracking-widest text-amber-400">LEADERBOARD</h1>
            <p className="text-white/40 text-sm mt-1">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              {lastUpdated && (
                <span> · Updated {lastUpdated.toLocaleTimeString()}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-xs">LIVE</span>
          </div>
        </div>

        {/* Prize pool */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { place: '1ST', pct: '60%', amount: prizes.first, color: 'text-amber-400', border: 'border-amber-500/20' },
            { place: '2ND', pct: '25%', amount: prizes.second, color: 'text-slate-300', border: 'border-slate-500/20' },
            { place: '3RD', pct: '10%', amount: prizes.third, color: 'text-amber-700', border: 'border-amber-700/20' },
            { place: '4TH', pct: '5%', amount: prizes.fourth, color: 'text-white/40', border: 'border-white/10' },
          ].map(({ place, pct, amount, color, border }) => (
            <div key={place} className={`bg-white/3 border ${border} rounded-xl p-3 text-center`}>
              <div className={`font-bebas text-lg ${color}`}>{place}</div>
              <div className="font-bebas text-2xl">${amount.toLocaleString()}</div>
              <div className="text-white/30 text-xs">{pct}</div>
            </div>
          ))}
        </div>

        {/* Leaderboard */}
        {(() => {
          const picksRevealed = picksRevealAt === null || now >= picksRevealAt

          if (loading) {
            return (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
                ))}
              </div>
            )
          }

          // ── PRE-REVEAL: names visible, picks/scores hidden ────────────────
          if (!picksRevealed && picksRevealAt) {
            const diff = picksRevealAt.getTime() - now.getTime()
            const days    = Math.floor(diff / (1000 * 60 * 60 * 24))
            const hours   = Math.floor((diff / (1000 * 60 * 60)) % 24)
            const minutes = Math.floor((diff / (1000 * 60)) % 60)
            const seconds = Math.floor((diff / 1000) % 60)

            return (
              <>
                {/* Reveal countdown banner */}
                <div className="bg-amber-500/8 border border-amber-500/25 rounded-2xl p-6 mb-6 text-center">
                  <div className="text-amber-400/70 text-xs uppercase tracking-widest mb-2">Picks revealed when tournament starts</div>
                  <div className="flex gap-3 justify-center mb-3">
                    {[
                      { label: 'DAYS',  val: days },
                      { label: 'HRS',   val: hours },
                      { label: 'MINS',  val: minutes },
                      { label: 'SECS',  val: seconds },
                    ].map(({ label, val }) => (
                      <div key={label} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 min-w-[58px]">
                        <div className="font-bebas text-3xl text-amber-400 leading-none">{String(val).padStart(2, '0')}</div>
                        <div className="text-white/30 text-[10px] tracking-widest mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-white/30 text-xs">
                    Scores and team picks become visible on{' '}
                    {picksRevealAt.toLocaleString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
                  </p>
                </div>

                {/* Names list — no scores, no picks, no expand */}
                {preRevealNames.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="font-bebas text-4xl text-white/20 mb-2">NO ENTRIES YET</div>
                    <p className="text-white/30 text-sm">Be the first to enter!</p>
                    <a href="/enter" className="inline-block mt-4 bg-amber-500 text-black font-bold px-6 py-2 rounded-lg">ENTER NOW</a>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {disambiguateNames(preRevealNames).map((e, idx) => (
                      <div key={e.id} className="bg-white/3 border border-white/10 rounded-xl px-4 py-3.5 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-sm text-white/40 font-bold flex-shrink-0">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-white truncate">{e.display_name}</div>
                          <div className="text-white/30 text-xs mt-0.5">Picks hidden until tournament starts</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          }

          // ── POST-REVEAL: full leaderboard ──────────────────────────────────
          if (entries.length === 0) {
            return (
              <div className="text-center py-20">
                <div className="font-bebas text-4xl text-white/20 mb-2">NO ENTRIES YET</div>
                <p className="text-white/30 text-sm">Be the first to enter!</p>
                <a href="/enter" className="inline-block mt-4 bg-amber-500 text-black font-bold px-6 py-2 rounded-lg">
                  ENTER NOW
                </a>
              </div>
            )
          }

          const displayNames = buildDisplayNameMap(entries, e => e.entry_id)

          return (
            <div className="space-y-2">
              <AnimatePresence>
                {entries.map((entry, idx) => {
                  const rank = idx + 1
                  const rankStyle = RANK_STYLES[rank]
                  const isExpanded = expandedId === entry.entry_id

                  return (
                    <motion.div
                      key={entry.entry_id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className={`rounded-xl border overflow-hidden ${rankStyle?.row || 'bg-white/3 border-white/10'}`}
                    >
                      {/* Main row */}
                      <button
                        onClick={() => toggleExpand(entry.entry_id)}
                        className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-white/3 transition-colors"
                      >
                        {/* Rank badge */}
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${rankStyle?.badge || 'bg-white/10 text-white/60'}`}>
                          {rank}
                        </div>

                        {/* Name */}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-white truncate">{displayNames.get(entry.entry_id) ?? entry.participant_name}</div>
                          <RemainingTeamsLine
                            remaining={remainingByEntry[entry.entry_id] ?? null}
                            upsetCount={entry.upset_count}
                          />
                        </div>

                        {/* Points */}
                        <div className="text-right flex-shrink-0">
                          <motion.div
                            key={entry.total_points}
                            className={`font-bebas text-2xl ${rank === 1 ? 'text-amber-400' : 'text-white'}`}
                            initial={{ scale: 1.2, color: '#f59e0b' }}
                            animate={{ scale: 1 }}
                            transition={{ duration: 0.3 }}
                          >
                            {entry.total_points}
                          </motion.div>
                          <div className="text-white/30 text-xs">pts</div>
                          {entry.tiebreaker_total != null && (
                            <div className="text-white/25 text-xs mt-0.5">TB: {entry.tiebreaker_total}</div>
                          )}
                        </div>

                        {/* Expand chevron */}
                        <svg
                          className={`w-4 h-4 text-white/30 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Expanded picks */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 border-t border-white/10 pt-4">
                              {expandedData[entry.entry_id] ? (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {expandedData[entry.entry_id]!
                                    .sort((a, b) => a.team!.seed - b.team!.seed)
                                    .map(pick => (
                                      <div key={pick.id} className={`bg-white/5 rounded-lg p-2.5 flex items-center gap-2 ${pick.team?.is_eliminated ? 'opacity-50' : ''}`}>
                                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold flex-shrink-0 ${getSeedBadgeColor(pick.team!.seed)}`}>
                                          {pick.team!.seed}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          <div className={`text-xs font-medium truncate ${pick.team?.is_eliminated ? 'line-through text-white/30' : 'text-white/80'}`}>
                                            {pick.team?.name}
                                          </div>
                                          {pick.points > 0 ? (
                                            <div className="flex items-center gap-1">
                                              <span className="text-amber-400 text-xs font-bold">+{pick.points}</span>
                                              {pick.isUpset && <span className="text-purple-400 text-xs">⚡</span>}
                                            </div>
                                          ) : (
                                            <div className="text-white/20 text-xs">0 pts</div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              ) : (
                                <div className="text-white/30 text-sm text-center py-4">Loading picks...</div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )
        })()}

        {/* Round legend */}
        {!loading && (picksRevealAt === null || now >= picksRevealAt) && entries.length > 0 && (
          <div className="mt-8 bg-white/3 border border-white/10 rounded-xl p-4">
            <h3 className="text-white/40 text-xs uppercase tracking-widest mb-3">Round Points Reference</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs">
              {Object.entries(ROUND_NAMES).map(([round, name]) => {
                const points = [0, 1, 2, 4, 6, 10, 20][parseInt(round)]
                return (
                  <div key={round} className="bg-white/3 rounded p-2">
                    <div className="text-amber-400 font-bold">{points}pt</div>
                    <div className="text-white/40 mt-0.5 leading-tight">{name}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
