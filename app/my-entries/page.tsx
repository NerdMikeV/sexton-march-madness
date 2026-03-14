'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getSeedBadgeColor } from '@/lib/scoring'
import type { Team } from '@/lib/types'

interface EntryWithPicks {
  id: string
  participant_name: string
  participant_email: string
  paid: boolean
  submitted_at: string
  picks: Team[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function MyEntriesContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [inputEmail, setInputEmail] = useState(searchParams.get('email') ?? '')
  const [entries, setEntries] = useState<EntryWithPicks[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const supabase = createClient()

  const lookup = useCallback(async (lookupEmail: string) => {
    setLoading(true)
    setError('')
    setSearched(false)

    const normalized = lookupEmail.trim().toLowerCase()

    const { data: entriesData, error: entriesErr } = await supabase
      .from('entries')
      .select('*')
      .ilike('participant_email', normalized)
      .order('submitted_at', { ascending: false })

    if (entriesErr) {
      setError('Failed to look up entries. Please try again.')
      setLoading(false)
      return
    }

    if (!entriesData || entriesData.length === 0) {
      setEntries([])
      setSearched(true)
      setLoading(false)
      return
    }

    // Fetch picks for all entries
    const withPicks: EntryWithPicks[] = await Promise.all(
      entriesData.map(async (entry) => {
        const { data: picks } = await supabase
          .from('entry_picks')
          .select('team:teams(*)')
          .eq('entry_id', entry.id)
        return {
          ...entry,
          picks: (picks ?? []).map((p: { team: Team | Team[] }) =>
            Array.isArray(p.team) ? p.team[0] : p.team
          ).filter(Boolean),
        }
      })
    )

    setEntries(withPicks)
    setSearched(true)
    setLoading(false)
  }, [supabase])

  // Auto-lookup if email was passed as query param
  useEffect(() => {
    const qEmail = searchParams.get('email')
    if (qEmail && EMAIL_RE.test(qEmail)) {
      setEmail(qEmail)
      setInputEmail(qEmail)
      lookup(qEmail)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!inputEmail.trim()) {
      setError('Please enter your email address.')
      return
    }
    if (!EMAIL_RE.test(inputEmail.trim())) {
      setError('Please enter a valid email address.')
      return
    }
    const normalized = inputEmail.trim().toLowerCase()
    setEmail(normalized)
    router.replace(`/my-entries?email=${encodeURIComponent(normalized)}`)
    lookup(normalized)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="font-bebas text-5xl tracking-widest leading-none mb-1">
          MY <span className="text-amber-400">ENTRIES</span>
        </h1>
        <p className="text-white/40 text-sm">
          Enter the email you used when submitting to see all your entries.
        </p>
      </div>

      {/* Email lookup form */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-8">
        <input
          type="email"
          value={inputEmail}
          onChange={e => setInputEmail(e.target.value)}
          placeholder="your@email.com"
          className="flex-1 bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-amber-500 transition-colors"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-6 py-3 rounded-xl transition-colors flex-shrink-0"
        >
          {loading ? 'Looking up…' : 'LOOK UP'}
        </button>
      </form>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl mb-6">
          {error}
        </div>
      )}

      {/* Results */}
      {searched && !loading && (
        <>
          {entries.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🔍</div>
              <div className="text-white/50 font-medium">No entries found for</div>
              <div className="text-white font-mono text-sm mt-1">{email}</div>
              <p className="text-white/30 text-sm mt-4">
                Double-check the email you used when entering.
              </p>
              <Link
                href="/enter"
                className="inline-block mt-6 bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-2.5 rounded-xl text-sm transition-colors"
              >
                ENTER THE CONTEST
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-white/60 text-sm">
                  Found <span className="text-white font-semibold">{entries.length}</span> {entries.length === 1 ? 'entry' : 'entries'} for{' '}
                  <span className="text-white/80 font-mono">{email}</span>
                </h2>
              </div>

              {entries.map((entry, idx) => (
                <div
                  key={entry.id}
                  className="bg-white/3 border border-white/10 rounded-2xl overflow-hidden"
                >
                  {/* Entry header */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white">{entry.participant_name}</span>
                        <span className="text-white/30 text-xs">Entry #{idx + 1}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            entry.paid
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {entry.paid ? 'PAID ✓' : 'PAYMENT PENDING'}
                        </span>
                      </div>
                      <div className="text-white/30 text-xs mt-1">
                        Submitted {new Date(entry.submitted_at).toLocaleDateString('en-US', {
                          month: 'long', day: 'numeric', year: 'numeric',
                        })}
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      className="text-white/40 hover:text-white border border-white/10 hover:border-white/25 text-xs px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                    >
                      {expandedId === entry.id ? 'Hide picks' : 'View picks'}
                    </button>
                  </div>

                  {/* Picks */}
                  {expandedId === entry.id && (
                    <div className="border-t border-white/8 px-5 py-4">
                      <div className="grid grid-cols-2 gap-2">
                        {entry.picks
                          .sort((a, b) => a.seed - b.seed)
                          .map(team => (
                            <div key={team.id} className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold flex-shrink-0 ${getSeedBadgeColor(team.seed)}`}
                              >
                                {team.seed}
                              </span>
                              <span className={`text-sm ${team.is_eliminated ? 'line-through text-white/30' : 'text-white/80'}`}>
                                {team.name}
                              </span>
                              {team.is_eliminated && (
                                <span className="text-red-400 text-[10px]">OUT</span>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Pay reminder if unpaid */}
                  {!entry.paid && (
                    <div className="border-t border-amber-500/15 bg-amber-500/5 px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-amber-400/80 text-xs">
                        Entry not locked in until $25 is received
                      </span>
                      <a
                        href={`https://venmo.com/TaylorSextonTX?txn=pay&amount=25&note=${encodeURIComponent(`March Madness - ${entry.participant_name}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-[#3d95ce] hover:bg-[#2d85be] text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-colors flex-shrink-0"
                      >
                        Pay via Venmo →
                      </a>
                    </div>
                  )}
                </div>
              ))}

              <div className="text-center pt-4">
                <Link
                  href="/enter"
                  className="text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors"
                >
                  + Submit another entry
                </Link>
              </div>
            </div>
          )}
        </>
      )}

      {/* Initial empty state */}
      {!searched && !loading && !searchParams.get('email') && (
        <div className="text-center py-12 text-white/20">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-sm">Enter your email above to see your entries</p>
        </div>
      )}
    </div>
  )
}

export default function MyEntriesPage() {
  return (
    <Suspense fallback={
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="h-10 w-64 bg-white/5 rounded animate-pulse mb-8" />
        <div className="h-14 bg-white/5 rounded-xl animate-pulse" />
      </div>
    }>
      <MyEntriesContent />
    </Suspense>
  )
}
