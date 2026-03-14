'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getSeedBadgeColor } from '@/lib/scoring'
import type { Team } from '@/lib/types'

const REGIONS = ['South', 'East', 'Midwest', 'West']
const ALL_SEEDS = Array.from({ length: 16 }, (_, i) => i + 1)
const DEADLINE = new Date('2025-03-20T23:59:59Z')
const BYPASS_DEADLINE = process.env.NEXT_PUBLIC_BYPASS_DEADLINE === 'true'

function SeedBadge({ seed }: { seed: number }) {
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 ${getSeedBadgeColor(seed)}`}>
      {seed}
    </span>
  )
}

export default function EnterPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [activeRegion, setActiveRegion] = useState('South')
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [entryId, setEntryId] = useState('')
  const [error, setError] = useState('')

  const isPastDeadline = !BYPASS_DEADLINE && new Date() > DEADLINE

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('teams')
      .select('*')
      .order('seed')
      .then(({ data }) => {
        setTeams(data || [])
        setLoading(false)
      })
  }, [])

  const selectedTeams = useMemo(
    () => teams.filter(t => selectedIds.has(t.id)),
    [teams, selectedIds]
  )

  const usedSeeds = useMemo(
    () => new Set(selectedTeams.map(t => t.seed)),
    [selectedTeams]
  )

  const filteredTeams = useMemo(() => {
    return teams
      .filter(t => t.region === activeRegion)
      .filter(t => search === '' || t.name.toLowerCase().includes(search.toLowerCase()))
  }, [teams, activeRegion, search])

  function toggleTeam(team: Team) {
    const next = new Set(selectedIds)
    if (next.has(team.id)) {
      next.delete(team.id)
    } else {
      if (next.size >= 8) {
        setError('You can only pick 8 teams. Remove one first.')
        return
      }
      if (usedSeeds.has(team.seed)) {
        setError(`You already have a #${team.seed} seed. Each seed can only appear once.`)
        return
      }
      next.add(team.id)
    }
    setError('')
    setSelectedIds(next)
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  async function handleSubmit() {
    setError('')
    if (!name.trim()) {
      setError('Please enter your name.')
      return
    }
    if (!email.trim()) {
      setError('Email is required so you can look up your entry later.')
      return
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email address.')
      return
    }
    if (selectedIds.size !== 8) {
      setError(`Please pick exactly 8 teams. You have ${selectedIds.size}.`)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantName: name.trim(),
          participantEmail: email.trim() || null,
          teamIds: Array.from(selectedIds),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Something went wrong.')
      } else {
        setEntryId(json.entryId)
        setSubmitted(true)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (isPastDeadline) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <div className="font-bebas text-6xl text-red-400 mb-4">ENTRIES CLOSED</div>
          <p className="text-white/60 mb-8">The entry deadline was March 20, 2025 at 11:59 PM.</p>
          <a href="/leaderboard" className="bg-amber-500 text-black font-bold px-6 py-3 rounded-lg">
            VIEW LEADERBOARD
          </a>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-lg w-full">
          {/* Success header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="font-bebas text-5xl text-amber-400 tracking-widest">ENTRY SUBMITTED!</div>
            <p className="text-white/50 mt-2">
              Nice picks, <span className="text-white font-semibold">{name}</span>!
            </p>
            <p className="text-white/30 text-xs mt-1">
              Confirmation sent to <span className="text-white/50">{email}</span>
            </p>
          </div>

          {/* Picks summary */}
          <div className="bg-white/3 border border-white/10 rounded-2xl p-5 mb-4">
            <h4 className="font-bebas text-lg tracking-widest text-white/70 mb-3">YOUR 8 PICKS</h4>
            <div className="grid grid-cols-2 gap-2">
              {selectedTeams.sort((a, b) => a.seed - b.seed).map(t => (
                <div key={t.id} className="flex items-center gap-2">
                  <SeedBadge seed={t.seed} />
                  <span className="text-sm text-white/80 truncate">{t.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pay via Venmo */}
          <div className="bg-amber-500/5 border border-amber-500/25 rounded-2xl p-5 mb-4">
            <h3 className="font-bebas text-xl tracking-widest text-amber-400 mb-1">STEP 2 — PAY $25</h3>
            <p className="text-white/50 text-sm mb-4">Your entry isn&apos;t locked in until payment is received.</p>
            <a
              href={`https://venmo.com/TaylorSextonTX?txn=pay&amount=25&note=${encodeURIComponent(`March Madness - ${name}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full bg-[#3d95ce] hover:bg-[#2d85be] text-white font-bold px-6 py-3.5 rounded-xl transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.45 2C16.83 2 14.9 3.23 13.7 5.56 12.85 4.34 11.54 3.6 9.88 3.6c-1.27 0-2.37.52-3.14 1.37L6 5.7 5.12 3.8H2L4.5 22h3.7l1.14-9.2c.36-2.9 1.64-4.3 3.42-4.3 1.48 0 2.3.97 2.3 2.74 0 .44-.05.92-.14 1.44L13.64 22h3.7l1.28-9.32c.38-2.78 1.6-4.18 3.4-4.18.2 0 .38.02.56.05L23 2.3C21.86 2.1 20.67 2 19.45 2z"/>
              </svg>
              Pay @TaylorSextonTX on Venmo
            </a>
            <p className="text-white/25 text-xs text-center mt-2">
              Include your name in the payment note
            </p>
          </div>

          {/* Footer links */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={`/my-entries?email=${encodeURIComponent(email)}`}
              className="flex-1 text-center border border-white/15 hover:border-white/30 text-white/60 hover:text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
            >
              View My Entries
            </Link>
            <button
              onClick={() => { setSubmitted(false); setSelectedIds(new Set()); setName(''); setEmail('') }}
              className="flex-1 text-center border border-white/15 hover:border-white/30 text-white/60 hover:text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
            >
              Submit Another Entry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
          <h1 className="font-bebas text-5xl tracking-widest text-amber-400 leading-none">ENTER THE CONTEST</h1>
          <Link href="/bracket" className="text-sm text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-500/60 px-3 py-1.5 rounded transition-colors">
            View Bracket →
          </Link>
        </div>
        <p className="text-white/50 mb-8">Pick exactly 8 teams — one per seed line. $25 per entry.</p>

        {/* Info fields */}
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          <div>
            <label className="text-white/60 text-sm block mb-2">Your Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. John Sexton"
              className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-white/60 text-sm block mb-2">Email * <span className="text-white/30 font-normal">(for entry lookup)</span></label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Team picker */}
          <div className="flex-1 min-w-0">
            {/* Seed usage indicator */}
            <div className="mb-4">
              <p className="text-white/40 text-xs mb-2 uppercase tracking-widest">Seed Usage</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_SEEDS.map(seed => (
                  <div
                    key={seed}
                    className={`flex items-center justify-center w-8 h-8 rounded text-xs font-bold transition-all ${
                      usedSeeds.has(seed)
                        ? getSeedBadgeColor(seed) + ' opacity-100 scale-110'
                        : 'bg-white/5 text-white/30'
                    }`}
                  >
                    {seed}
                  </div>
                ))}
              </div>
            </div>

            {/* Region tabs */}
            <div className="flex gap-1 mb-4 overflow-x-auto">
              {REGIONS.map(region => (
                <button
                  key={region}
                  onClick={() => setActiveRegion(region)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeRegion === region
                      ? 'bg-amber-500 text-black'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {region}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search teams..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 pl-9 text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500 transition-colors"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Teams grid */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredTeams.map(team => {
                  const isSelected = selectedIds.has(team.id)
                  const seedConflict = !isSelected && usedSeeds.has(team.seed)
                  const atMax = !isSelected && selectedIds.size >= 8

                  return (
                    <button
                      key={team.id}
                      onClick={() => toggleTeam(team)}
                      disabled={team.is_eliminated || (seedConflict && !isSelected) || (atMax)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30'
                          : team.is_eliminated
                          ? 'bg-white/2 border-white/5 opacity-40 cursor-not-allowed'
                          : seedConflict || atMax
                          ? 'bg-white/2 border-white/5 opacity-40 cursor-not-allowed'
                          : 'bg-white/3 border-white/10 hover:border-amber-500/30 hover:bg-white/5 cursor-pointer'
                      }`}
                    >
                      <SeedBadge seed={team.seed} />
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium text-sm ${team.is_eliminated ? 'line-through text-white/40' : isSelected ? 'text-white' : 'text-white/80'}`}>
                          {team.name}
                        </div>
                        {team.is_eliminated && (
                          <div className="text-red-400 text-xs">Eliminated</div>
                        )}
                      </div>
                      {isSelected && (
                        <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  )
                })}
                {filteredTeams.length === 0 && (
                  <div className="col-span-2 text-center text-white/30 py-8">No teams found</div>
                )}
              </div>
            )}
          </div>

          {/* My Picks sidebar */}
          <div className="lg:w-72 flex-shrink-0">
            <div className="sticky top-20">
              <div className="bg-white/3 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bebas text-xl tracking-widest">MY PICKS</h3>
                  <span className={`font-bebas text-lg ${selectedIds.size === 8 ? 'text-amber-400' : 'text-white/40'}`}>
                    {selectedIds.size}/8
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 bg-white/10 rounded-full mb-4 overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${(selectedIds.size / 8) * 100}%` }}
                  />
                </div>

                {/* Selected teams list */}
                <div className="space-y-2 min-h-[200px]">
                  {selectedIds.size === 0 ? (
                    <p className="text-white/20 text-sm text-center py-8">Select teams from the left</p>
                  ) : (
                    selectedTeams.sort((a, b) => a.seed - b.seed).map(team => (
                      <div key={team.id} className="flex items-center gap-2 group">
                        <SeedBadge seed={team.seed} />
                        <span className="flex-1 text-sm text-white/80 min-w-0 truncate">{team.name}</span>
                        <button
                          onClick={() => toggleTeam(team)}
                          className="text-white/20 hover:text-red-400 transition-colors p-1 opacity-0 group-hover:opacity-100"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {error && (
                  <div className="mt-4 bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-lg">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={selectedIds.size !== 8 || !name.trim() || !email.trim() || submitting}
                  className="w-full mt-4 bg-amber-500 hover:bg-amber-400 disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed text-black font-bold py-3 rounded-lg transition-colors"
                >
                  {submitting ? 'Submitting...' : selectedIds.size === 8 ? 'SUBMIT ENTRY' : `Pick ${8 - selectedIds.size} more`}
                </button>

                {selectedIds.size === 8 && (!name.trim() || !email.trim()) && (
                  <p className="text-amber-400 text-xs text-center mt-2">
                    {!name.trim() ? 'Enter your name above to submit' : 'Enter your email above to submit'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
