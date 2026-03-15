'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getPrizeDistribution } from '@/lib/scoring'

function Countdown({ deadline }: { deadline: Date }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const [isPast, setIsPast] = useState(false)

  useEffect(() => {
    function tick() {
      const now = new Date()
      const diff = deadline.getTime() - now.getTime()
      if (diff <= 0) {
        setIsPast(true)
        return
      }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadline])

  if (isPast) {
    return (
      <div className="inline-block bg-red-500/20 border border-red-500/40 text-red-400 font-bebas tracking-widest text-2xl px-6 py-3 rounded-lg">
        ENTRIES CLOSED
      </div>
    )
  }

  const units = [
    { label: 'DAYS', value: timeLeft.days },
    { label: 'HOURS', value: timeLeft.hours },
    { label: 'MINS', value: timeLeft.minutes },
    { label: 'SECS', value: timeLeft.seconds },
  ]

  return (
    <div className="flex gap-3 justify-center flex-wrap">
      {units.map(({ label, value }) => (
        <div key={label} className="flex flex-col items-center bg-white/5 border border-white/10 rounded-lg px-4 py-3 min-w-[72px]">
          <span className="font-bebas text-4xl text-amber-400 leading-none">
            {String(value).padStart(2, '0')}
          </span>
          <span className="text-white/40 text-xs tracking-widest mt-1">{label}</span>
        </div>
      ))}
    </div>
  )
}

export default function HomePage() {
  const [entryCount, setEntryCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [deadline, setDeadline] = useState<Date | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('entries').select('id', { count: 'exact', head: true }).then(({ count }) => {
      setEntryCount(count || 0)
      setLoading(false)
    })
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'entry_deadline')
      .single()
      .then(({ data }) => {
        if (data?.value) {
          const raw = typeof data.value === 'string'
            ? data.value.replace(/^"|"$/g, '')
            : String(data.value)
          setDeadline(new Date(raw))
        }
      })
  }, [])

  const prizes = getPrizeDistribution(entryCount)

  const rules = [
    { icon: '🎯', title: 'Pick 8 Teams', desc: 'Choose exactly 8 teams — max one per seed line (no two #1 seeds, etc.)' },
    { icon: '🏀', title: 'Earn Points Per Win', desc: 'R64: 1pt • R32: 2pts • Sweet 16: 4pts • Elite 8: 6pts • F4: 10pts • Championship: 20pts' },
    { icon: '⚡', title: 'Upset Bonus', desc: 'When a higher-numbered seed beats a lower one, you earn DOUBLE points' },
    { icon: '💵', title: '$25 Per Entry', desc: 'Multiple entries allowed. Pay via Venmo (@TaylorSextonTX) after submitting.' },
  ]

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto px-4 pt-16 pb-12 text-center">
          <p className="text-amber-400 text-sm tracking-[0.3em] uppercase mb-4 font-medium">
            NCAA Tournament 2025
          </p>
          <h1 className="font-bebas text-6xl sm:text-8xl lg:text-9xl leading-none mb-2 tracking-wider">
            SEXTON
          </h1>
          <h1 className="font-bebas text-5xl sm:text-7xl lg:text-8xl leading-none mb-6 tracking-wider text-amber-400">
            MARCH MADNESS
          </h1>
          <p className="text-white/60 text-lg max-w-xl mx-auto mb-10">
            Pick 8 teams. Earn points for every win. Double points for upsets. Compete for the pot.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link
              href="/enter"
              className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-lg px-8 py-4 rounded-lg transition-all hover:scale-105 active:scale-100"
            >
              ENTER THE CONTEST
            </Link>
            <Link
              href="/leaderboard"
              className="bg-white/5 hover:bg-white/10 border border-white/20 text-white font-bold text-lg px-8 py-4 rounded-lg transition-all"
            >
              VIEW LEADERBOARD
            </Link>
          </div>

          {/* Deadline countdown */}
          {deadline && (
            <div className="mb-6">
              <p className="text-white/50 text-sm mb-4 tracking-widest uppercase">Entry Deadline</p>
              <Countdown deadline={deadline} />
              <p className="text-white/30 text-xs mt-3">
                {deadline.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Prize Pool */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <div className="bg-white/3 border border-white/10 rounded-2xl p-6 md:p-8">
          <div className="text-center mb-8">
            <h2 className="font-bebas text-4xl tracking-widest text-amber-400">PRIZE POOL</h2>
            <div className="font-bebas text-6xl mt-2">
              {loading ? (
                <span className="text-white/20">—</span>
              ) : (
                <span>${prizes.pot.toLocaleString()}</span>
              )}
            </div>
            {!loading && (
              <p className="text-white/40 text-sm mt-1">{entryCount} {entryCount === 1 ? 'entry' : 'entries'} × $25</p>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { place: '1ST', pct: '60%', amount: prizes.first, color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/5' },
              { place: '2ND', pct: '25%', amount: prizes.second, color: 'text-slate-300', border: 'border-slate-500/30', bg: 'bg-slate-500/5' },
              { place: '3RD', pct: '10%', amount: prizes.third, color: 'text-amber-700', border: 'border-amber-700/30', bg: 'bg-amber-700/5' },
              { place: '4TH', pct: '5%', amount: prizes.fourth, color: 'text-white/50', border: 'border-white/10', bg: 'bg-white/3' },
            ].map(({ place, pct, amount, color, border, bg }) => (
              <div key={place} className={`${bg} border ${border} rounded-xl p-4 text-center`}>
                <div className={`font-bebas text-2xl ${color}`}>{place}</div>
                <div className="font-bebas text-3xl mt-1">${loading ? '—' : amount.toLocaleString()}</div>
                <div className="text-white/40 text-xs mt-1">{pct} of pot</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Rules */}
      <section className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="font-bebas text-3xl tracking-widest text-center mb-8 text-white/80">HOW IT WORKS</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {rules.map(({ icon, title, desc }) => (
            <div key={title} className="bg-white/3 border border-white/10 rounded-xl p-5 flex gap-4">
              <span className="text-3xl flex-shrink-0">{icon}</span>
              <div>
                <h3 className="font-bold text-white mb-1">{title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Scoring Table */}
      <section className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-white/3 border border-white/10 rounded-2xl p-6">
          <h2 className="font-bebas text-2xl tracking-widest text-amber-400 mb-4">SCORING BREAKDOWN</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 border-b border-white/10">
                  <th className="text-left py-2 font-medium">Round</th>
                  <th className="text-right py-2 font-medium">Base Points</th>
                  <th className="text-right py-2 font-medium">Upset Points</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { round: 'Round of 64', base: 1, upset: 2 },
                  { round: 'Round of 32', base: 2, upset: 4 },
                  { round: 'Sweet 16', base: 4, upset: 8 },
                  { round: 'Elite 8', base: 6, upset: 12 },
                  { round: 'Final Four', base: 10, upset: 20 },
                  { round: 'Championship', base: 20, upset: 40 },
                ].map(({ round, base, upset }) => (
                  <tr key={round} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="py-3 text-white/80">{round}</td>
                    <td className="py-3 text-right text-amber-400 font-medium">{base} pt{base > 1 ? 's' : ''}</td>
                    <td className="py-3 text-right">
                      <span className="text-purple-400 font-medium">{upset} pts</span>
                      <span className="text-white/20 text-xs ml-1">(2x upset)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Payment Info */}
      <section className="max-w-5xl mx-auto px-4 py-8 pb-20">
        <div className="bg-white/3 border border-amber-500/20 rounded-2xl p-6 text-center">
          <h2 className="font-bebas text-2xl tracking-widest text-amber-400 mb-2">PAYMENT</h2>
          <p className="text-white/60 text-sm mb-6">After submitting your entry, pay $25 via Venmo:</p>
          <a
            href="https://venmo.com/TaylorSextonTX"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-col items-center bg-[#3d95ce]/15 border border-[#3d95ce]/30 hover:bg-[#3d95ce]/25 rounded-xl px-10 py-5 transition-colors"
          >
            <div className="font-bold text-white text-lg">Venmo</div>
            <div className="text-[#3d95ce] font-mono text-base mt-1">@TaylorSextonTX</div>
          </a>
          <p className="text-white/30 text-xs mt-4">Include your name in the payment note</p>
        </div>
      </section>
    </div>
  )
}
