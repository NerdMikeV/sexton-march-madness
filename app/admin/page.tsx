'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getSeedBadgeColor, getPrizeDistribution } from '@/lib/scoring'
import type { Team, Entry, GameResult } from '@/lib/types'
import { ROUND_NAMES } from '@/lib/types'

type EntryWithPicks = Entry & { picks: (Team & { pick_id: string })[] }

const TABS = ['Teams', 'Results', 'Entries', 'Settings'] as const
type Tab = typeof TABS[number]

export default function AdminPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('Teams')

  // Teams state
  const [teams, setTeams] = useState<Team[]>([])
  const [bulkCsv, setBulkCsv] = useState('')
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResult, setCsvResult] = useState('')

  // Results state
  const [results, setResults] = useState<(GameResult & { winning_team: Team; losing_team: Team })[]>([])
  const [winTeamId, setWinTeamId] = useState('')
  const [loseTeamId, setLoseTeamId] = useState('')
  const [resultRound, setResultRound] = useState('1')
  const [resultError, setResultError] = useState('')
  const [resultSuccess, setResultSuccess] = useState('')
  const [simulating, setSimulating] = useState(false)
  const [simResult, setSimResult] = useState('')

  // Entries state
  const [entries, setEntries] = useState<EntryWithPicks[]>([])
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null)

  // Settings state
  const [deadline, setDeadline] = useState('')
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetResult, setResetResult] = useState('')

  const supabase = createClient()

  const checkAuth = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/admin/login')
      return
    }
    setUser({ email: user.email })

    // Check admin status
    const { data: adminEmails } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'admin_emails')
      .single()

    if (adminEmails) {
      const emails = (adminEmails.value as { email: string }[]).map(e => e.email)
      if (user.email && emails.includes(user.email)) {
        setIsAdmin(true)
      } else {
        router.push('/')
      }
    } else {
      // If no admin_emails setting, allow any authenticated user
      setIsAdmin(true)
    }
    setLoading(false)
  }, [router, supabase])

  const fetchTeams = useCallback(async () => {
    const { data } = await supabase.from('teams').select('*').order('region').order('seed')
    setTeams(data || [])
  }, [supabase])

  const fetchResults = useCallback(async () => {
    const { data } = await supabase
      .from('game_results')
      .select('*, winning_team:teams!game_results_winning_team_id_fkey(*), losing_team:teams!game_results_losing_team_id_fkey(*)')
      .order('entered_at', { ascending: false })
    setResults(data || [])
  }, [supabase])

  const fetchEntries = useCallback(async () => {
    const { data: entriesData } = await supabase
      .from('entries')
      .select('*')
      .order('submitted_at', { ascending: false })

    if (!entriesData) return

    const withPicks: EntryWithPicks[] = await Promise.all(
      entriesData.map(async (entry) => {
        const { data: picks } = await supabase
          .from('entry_picks')
          .select('id, team:teams(*)')
          .eq('entry_id', entry.id)
        return {
          ...entry,
          picks: (picks || []).map((p: { id: string; team: Team | Team[] }) => {
            const team = Array.isArray(p.team) ? p.team[0] : p.team
            return { ...team, pick_id: p.id }
          }),
        }
      })
    )
    setEntries(withPicks)
  }, [supabase])

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from('settings').select('*').eq('key', 'entry_deadline').single()
    if (data) {
      const val = typeof data.value === 'string' ? data.value.replace(/^"|"$/g, '') : ''
      setDeadline(val.slice(0, 16))
    }
  }, [supabase])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (!isAdmin) return
    fetchTeams()
    fetchResults()
    fetchEntries()
    fetchSettings()
  }, [isAdmin, fetchTeams, fetchResults, fetchEntries, fetchSettings])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  async function toggleEliminated(team: Team) {
    await supabase.from('teams').update({ is_eliminated: !team.is_eliminated }).eq('id', team.id)
    fetchTeams()
  }

  async function handleBulkImport() {
    setCsvImporting(true)
    setCsvResult('')
    try {
      const res = await fetch('/api/admin/teams/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: bulkCsv }),
      })
      const json = await res.json()
      if (res.ok) {
        setCsvResult(`Imported ${json.count} teams successfully.`)
        setBulkCsv('')
        fetchTeams()
      } else {
        setCsvResult(`Error: ${json.error}`)
      }
    } catch {
      setCsvResult('Network error.')
    }
    setCsvImporting(false)
  }

  async function submitResult() {
    setResultError('')
    setResultSuccess('')
    if (!winTeamId || !loseTeamId) {
      setResultError('Select both teams.')
      return
    }
    if (winTeamId === loseTeamId) {
      setResultError('Teams must be different.')
      return
    }
    const res = await fetch('/api/admin/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winningTeamId: winTeamId, losingTeamId: loseTeamId, round: parseInt(resultRound) }),
    })
    const json = await res.json()
    if (res.ok) {
      setResultSuccess('Result entered.')
      setWinTeamId('')
      setLoseTeamId('')
      fetchResults()
    } else {
      setResultError(json.error || 'Error saving result.')
    }
  }

  async function simulate2025() {
    if (!confirm('This will DELETE all existing results and insert all 63 games from the 2025 NCAA Tournament (Florida champion). Continue?')) return
    setSimulating(true)
    setSimResult('')
    try {
      const res = await fetch('/api/admin/simulate', { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        setSimResult(`Inserted ${json.count} results. Leaderboard is now fully populated.`)
        fetchResults()
      } else {
        setSimResult(`Error: ${json.error}`)
      }
    } catch {
      setSimResult('Network error.')
    }
    setSimulating(false)
  }

  async function deleteResult(id: string) {
    if (!confirm('Delete this result?')) return
    await fetch(`/api/admin/results/${id}`, { method: 'DELETE' })
    fetchResults()
  }

  async function togglePaid(entry: Entry) {
    await fetch(`/api/admin/entries/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: !entry.paid }),
    })
    fetchEntries()
  }

  async function deleteEntry(id: string) {
    if (!confirm('Delete this entry?')) return
    await fetch(`/api/admin/entries/${id}`, { method: 'DELETE' })
    fetchEntries()
  }

  async function resetContest() {
    const confirmed = confirm(
      'RESET CONTEST?\n\nThis will permanently delete:\n  • All game results\n  • All entries\n  • All entry picks\n\nTeams and settings will not be affected.\n\nThis cannot be undone. Type OK to confirm.'
    )
    if (!confirmed) return

    setResetting(true)
    setResetResult('')
    try {
      const res = await fetch('/api/admin/reset', { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        setResetResult('Contest reset successfully. All results, entries, and picks have been cleared.')
        fetchResults()
        fetchEntries()
      } else {
        setResetResult(`Error: ${json.error}`)
      }
    } catch {
      setResetResult('Network error.')
    }
    setResetting(false)
  }

  async function saveSettings() {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry_deadline: new Date(deadline).toISOString() }),
    })
    if (res.ok) {
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 3000)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/40">Loading...</div>
      </div>
    )
  }

  if (!isAdmin) return null

  const paidCount = entries.filter(e => e.paid).length
  const prizes = getPrizeDistribution(entries.length)

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-bebas text-4xl tracking-widest text-amber-400">ADMIN PANEL</h1>
            <p className="text-white/40 text-sm mt-1">{user?.email}</p>
          </div>
          <button
            onClick={signOut}
            className="text-white/40 hover:text-white text-sm border border-white/10 px-4 py-2 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Total Entries', value: entries.length },
            { label: 'Paid', value: `${paidCount}/${entries.length}` },
            { label: 'Pot', value: `$${prizes.pot.toLocaleString()}` },
            { label: 'Game Results', value: results.length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/3 border border-white/10 rounded-xl p-4">
              <div className="font-bebas text-2xl text-amber-400">{value}</div>
              <div className="text-white/40 text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab ? 'bg-amber-500 text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* TEAMS TAB */}
        {activeTab === 'Teams' && (
          <div className="space-y-6">
            {/* Bulk import */}
            <div className="bg-white/3 border border-white/10 rounded-2xl p-6">
              <h3 className="font-bebas text-xl tracking-widest mb-4 text-amber-400">BULK IMPORT CSV</h3>
              <p className="text-white/40 text-sm mb-3">Format: <code className="bg-white/10 px-1 rounded text-xs">seed,name,region</code> (one per line)</p>
              <textarea
                value={bulkCsv}
                onChange={e => setBulkCsv(e.target.value)}
                placeholder="1,Duke,East&#10;2,Alabama,East&#10;..."
                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm font-mono text-white/80 focus:outline-none focus:border-amber-500 h-32 resize-none"
              />
              {csvResult && (
                <div className={`mt-2 text-sm ${csvResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                  {csvResult}
                </div>
              )}
              <button
                onClick={handleBulkImport}
                disabled={!bulkCsv.trim() || csvImporting}
                className="mt-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold px-6 py-2 rounded-lg text-sm transition-colors"
              >
                {csvImporting ? 'Importing...' : 'IMPORT'}
              </button>
            </div>

            {/* Teams table */}
            <div className="bg-white/3 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h3 className="font-bebas text-xl tracking-widest text-amber-400">ALL TEAMS ({teams.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-white/40 border-b border-white/10">
                      <th className="text-left px-6 py-3 font-medium">Seed</th>
                      <th className="text-left px-6 py-3 font-medium">Team</th>
                      <th className="text-left px-6 py-3 font-medium">Region</th>
                      <th className="text-left px-6 py-3 font-medium">Status</th>
                      <th className="text-right px-6 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map(team => (
                      <tr key={team.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                        <td className="px-6 py-3">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${getSeedBadgeColor(team.seed)}`}>
                            {team.seed}
                          </span>
                        </td>
                        <td className={`px-6 py-3 font-medium ${team.is_eliminated ? 'line-through text-white/30' : ''}`}>{team.name}</td>
                        <td className="px-6 py-3 text-white/60">{team.region}</td>
                        <td className="px-6 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${team.is_eliminated ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                            {team.is_eliminated ? 'Eliminated' : 'Active'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <button
                            onClick={() => toggleEliminated(team)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                              team.is_eliminated
                                ? 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                                : 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                            }`}
                          >
                            {team.is_eliminated ? 'Restore' : 'Eliminate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* RESULTS TAB */}
        {activeTab === 'Results' && (
          <div className="space-y-6">
            {/* Enter result form */}
            <div className="bg-white/3 border border-white/10 rounded-2xl p-6">
              <h3 className="font-bebas text-xl tracking-widest mb-4 text-amber-400">ENTER GAME RESULT</h3>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-white/60 text-xs block mb-2 uppercase tracking-widest">Winner</label>
                  <select
                    value={winTeamId}
                    onChange={e => setWinTeamId(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Select winner...</option>
                    {['South', 'East', 'Midwest', 'West'].map(region => (
                      <optgroup key={region} label={region}>
                        {teams.filter(t => t.region === region).map(t => (
                          <option key={t.id} value={t.id}>#{t.seed} {t.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-white/60 text-xs block mb-2 uppercase tracking-widest">Loser</label>
                  <select
                    value={loseTeamId}
                    onChange={e => setLoseTeamId(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Select loser...</option>
                    {['South', 'East', 'Midwest', 'West'].map(region => (
                      <optgroup key={region} label={region}>
                        {teams.filter(t => t.region === region).map(t => (
                          <option key={t.id} value={t.id}>#{t.seed} {t.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-white/60 text-xs block mb-2 uppercase tracking-widest">Round</label>
                  <select
                    value={resultRound}
                    onChange={e => setResultRound(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    {Object.entries(ROUND_NAMES).map(([num, name]) => (
                      <option key={num} value={num}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Upset preview */}
              {winTeamId && loseTeamId && (() => {
                const winner = teams.find(t => t.id === winTeamId)
                const loser = teams.find(t => t.id === loseTeamId)
                const isUpset = winner && loser && winner.seed > loser.seed
                const points = [0, 1, 2, 4, 6, 10, 20][parseInt(resultRound)]
                if (winner && loser) {
                  return (
                    <div className={`mt-3 p-3 rounded-lg text-sm ${isUpset ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-white/5'}`}>
                      {isUpset ? (
                        <span className="text-purple-400">⚡ UPSET — #{winner.seed} {winner.name} beats #{loser.seed} {loser.name} — awards <strong>{points * 2} pts</strong> (2x)</span>
                      ) : (
                        <span className="text-white/60">#{winner.seed} {winner.name} beats #{loser.seed} {loser.name} — awards <strong>{points} pts</strong></span>
                      )}
                    </div>
                  )
                }
                return null
              })()}
              {resultError && <div className="mt-3 text-red-400 text-sm">{resultError}</div>}
              {resultSuccess && <div className="mt-3 text-green-400 text-sm">{resultSuccess}</div>}
              <button
                onClick={submitResult}
                className="mt-4 bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-2.5 rounded-lg text-sm transition-colors"
              >
                SUBMIT RESULT
              </button>
            </div>

            {/* Simulate 2025 results */}
            <div className="bg-white/3 border border-amber-500/20 rounded-2xl p-6">
              <h3 className="font-bebas text-xl tracking-widest mb-1 text-amber-400">SIMULATE 2025 TOURNAMENT</h3>
              <p className="text-white/40 text-sm mb-4">
                Bulk-insert all 63 game results from the 2025 NCAA Tournament (Florida champion, beat Houston 65-63).
                Includes upsets: McNeese over Clemson &amp; Purdue, Colorado State over Memphis &amp; Maryland, and more.
                <span className="text-red-400"> Clears all existing results first.</span>
              </p>
              {simResult && (
                <div className={`mb-4 text-sm ${simResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                  {simResult}
                </div>
              )}
              <button
                onClick={simulate2025}
                disabled={simulating}
                className="bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 border border-amber-500/40 text-amber-400 font-bold px-6 py-2.5 rounded-lg text-sm transition-colors"
              >
                {simulating ? 'Simulating...' : '⚡ SIMULATE 2025 RESULTS (63 games)'}
              </button>
            </div>

            {/* Results list */}
            <div className="bg-white/3 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h3 className="font-bebas text-xl tracking-widest text-amber-400">ENTERED RESULTS ({results.length})</h3>
              </div>
              {results.length === 0 ? (
                <div className="text-center text-white/30 py-8">No results yet</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {results.map(r => {
                    const isUpset = r.winning_team.seed > r.losing_team.seed
                    const points = [0, 1, 2, 4, 6, 10, 20][r.round]
                    return (
                      <div key={r.id} className="flex items-center gap-4 px-6 py-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${getSeedBadgeColor(r.winning_team.seed)}`}>#{r.winning_team.seed}</span>
                            <span className="font-medium text-sm">{r.winning_team.name}</span>
                            <span className="text-white/30 text-xs">def.</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${getSeedBadgeColor(r.losing_team.seed)}`}>#{r.losing_team.seed}</span>
                            <span className="text-white/60 text-sm">{r.losing_team.name}</span>
                            {isUpset && <span className="text-purple-400 text-xs">⚡ UPSET</span>}
                          </div>
                          <div className="text-white/30 text-xs mt-1">
                            {ROUND_NAMES[r.round]} · {isUpset ? points * 2 : points} pts · {new Date(r.entered_at).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteResult(r.id)}
                          className="text-red-400/50 hover:text-red-400 text-xs border border-red-500/20 hover:border-red-500/40 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                        >
                          Delete
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ENTRIES TAB */}
        {activeTab === 'Entries' && (
          <div className="space-y-4">
            <div className="bg-white/3 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-bebas text-xl tracking-widest text-amber-400">ALL ENTRIES ({entries.length})</h3>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <span className="text-green-400">{paidCount} paid</span>
                    <span className="text-red-400">{entries.length - paidCount} unpaid</span>
                    <span className="text-white/40">${paidCount * 25} collected</span>
                  </div>
                </div>
              </div>
              {entries.length === 0 ? (
                <div className="text-center text-white/30 py-8">No entries yet</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {entries.map(entry => (
                    <div key={entry.id}>
                      <div className="flex items-center gap-4 px-6 py-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{entry.participant_name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${entry.paid ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                              {entry.paid ? 'PAID' : 'UNPAID'}
                            </span>
                          </div>
                          {entry.participant_email && (
                            <div className="text-white/30 text-xs mt-0.5">{entry.participant_email}</div>
                          )}
                          <div className="text-white/30 text-xs mt-0.5">
                            {new Date(entry.submitted_at).toLocaleDateString()} · {entry.picks.length} picks
                            {entry.tiebreaker_total != null && (
                              <span className="ml-2 text-white/40">TB: {entry.tiebreaker_total}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                            className="text-white/40 hover:text-white text-xs border border-white/10 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {expandedEntry === entry.id ? 'Hide' : 'Picks'}
                          </button>
                          <button
                            onClick={() => togglePaid(entry)}
                            className={`text-xs border px-3 py-1.5 rounded-lg transition-colors ${
                              entry.paid
                                ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                                : 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                            }`}
                          >
                            {entry.paid ? 'Unpaid' : 'Mark Paid'}
                          </button>
                          <button
                            onClick={() => deleteEntry(entry.id)}
                            className="text-red-400/50 hover:text-red-400 text-xs border border-red-500/20 hover:border-red-500/40 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      {expandedEntry === entry.id && (
                        <div className="px-6 pb-4 bg-white/2">
                          <div className="flex flex-wrap gap-2">
                            {entry.picks.sort((a, b) => a.seed - b.seed).map(team => (
                              <div key={team.id} className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2 py-1.5">
                                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${getSeedBadgeColor(team.seed)}`}>
                                  {team.seed}
                                </span>
                                <span className={`text-xs ${team.is_eliminated ? 'line-through text-white/30' : 'text-white/70'}`}>
                                  {team.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'Settings' && (
          <div className="space-y-6 max-w-lg">
            {/* Entry deadline */}
            <div className="bg-white/3 border border-white/10 rounded-2xl p-6">
              <h3 className="font-bebas text-xl tracking-widest mb-4 text-amber-400">CONTEST SETTINGS</h3>
              <div>
                <label className="text-white/60 text-sm block mb-2">Entry Deadline</label>
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              {settingsSaved && (
                <div className="mt-3 text-green-400 text-sm">Settings saved!</div>
              )}
              <button
                onClick={saveSettings}
                className="mt-4 bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-2.5 rounded-lg text-sm transition-colors"
              >
                SAVE SETTINGS
              </button>
            </div>

            {/* Danger zone — Reset contest */}
            <div className="bg-red-500/5 border border-red-500/25 rounded-2xl p-6">
              <h3 className="font-bebas text-xl tracking-widest mb-1 text-red-400">DANGER ZONE</h3>
              <p className="text-white/40 text-sm mb-4">
                Permanently deletes all game results, all entries, and all entry picks.
                Teams and settings are not affected. Use this to reset between test runs
                and the live contest.
              </p>
              <div className="bg-white/3 border border-white/10 rounded-lg px-4 py-3 text-xs text-white/50 mb-4 space-y-1">
                <div>Will delete: <span className="text-red-400">{results.length} game results</span></div>
                <div>Will delete: <span className="text-red-400">{entries.length} entries</span> and all their picks</div>
                <div>Will keep: <span className="text-white/70">all 64 teams, deadline, admin settings</span></div>
              </div>
              {resetResult && (
                <div className={`mb-4 text-sm px-3 py-2 rounded-lg ${
                  resetResult.startsWith('Error')
                    ? 'bg-red-500/10 text-red-400'
                    : 'bg-green-500/10 text-green-400'
                }`}>
                  {resetResult}
                </div>
              )}
              <button
                onClick={resetContest}
                disabled={resetting}
                className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold px-6 py-2.5 rounded-lg text-sm transition-colors"
              >
                {resetting ? 'Resetting…' : 'RESET CONTEST'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
