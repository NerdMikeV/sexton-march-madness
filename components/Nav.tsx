'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function Nav() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [year, setYear] = useState<string>('')

  useEffect(() => {
    const supabase = createClient()
    supabase.from('settings').select('value').eq('key', 'contest_year').single()
      .then(({ data }) => {
        if (data?.value != null) setYear(String(data.value))
      })
  }, [])

  const links = [
    { href: '/', label: 'Home' },
    { href: '/enter', label: 'Enter' },
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/bracket', label: 'Bracket' },
    { href: '/my-entries', label: 'My Entries' },
    { href: '/scores', label: 'Live Scores' },
  ]

  return (
    <nav className="sticky top-0 z-50 bg-[#060a12]/95 backdrop-blur border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bebas tracking-widest text-amber-400">
            SEXTON <span className="text-white">MM</span>
          </span>
          {year && <span className="text-xs text-white/40 hidden sm:inline">{year}</span>}
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors ${
                pathname === link.href
                  ? 'text-amber-400'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/enter"
            className="bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold px-4 py-2 rounded transition-colors"
          >
            ENTER NOW
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-white/70 hover:text-white p-1"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          {menuOpen ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#060a12] px-4 py-4 flex flex-col gap-4">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`text-base font-medium transition-colors ${
                pathname === link.href ? 'text-amber-400' : 'text-white/70'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/enter"
            onClick={() => setMenuOpen(false)}
            className="bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold px-4 py-3 rounded text-center transition-colors"
          >
            ENTER NOW — $25
          </Link>
        </div>
      )}
    </nav>
  )
}
