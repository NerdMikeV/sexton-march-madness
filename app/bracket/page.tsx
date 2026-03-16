'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getSeedBadgeColor } from '@/lib/scoring'
import type { Team, GameResult } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants — all dimensions in px
// ─────────────────────────────────────────────────────────────────────────────
const MH   = 60   // matchup card height (border-box)
const R1G  = 8    // gap between adjacent R1 matchups
const CW   = 18   // width of each SVG connector column
const CARDW = 148 // matchup card width

// Pre-compute the top-offset and vertical center of every matchup in every round.
// Each later-round matchup is centered between the two feeder matchups that produced it.
const POS: { top: number; cy: number }[][] = (() => {
  const r1 = Array.from({ length: 8 }, (_, i) => {
    const top = i * (MH + R1G)
    return { top, cy: top + MH / 2 }
  })
  function next(prev: { top: number; cy: number }[]) {
    return Array.from({ length: prev.length / 2 }, (_, i) => {
      const cy = (prev[i * 2].cy + prev[i * 2 + 1].cy) / 2
      return { top: cy - MH / 2, cy }
    })
  }
  const r2 = next(r1)
  const r3 = next(r2)
  const r4 = next(r3)
  return [r1, r2, r3, r4]
})()

// Total pixel height of one region bracket (matches R1's span)
const BH = POS[0][7].top + MH   // = 536

// ─────────────────────────────────────────────────────────────────────────────
// Data types & constants
// ─────────────────────────────────────────────────────────────────────────────
type FullResult = GameResult & { winning_team: Team; losing_team: Team }

interface Slot {
  top:    Team | null
  bottom: Team | null
  winner: Team | null
}

const REGIONS = ['South', 'East', 'Midwest', 'West'] as const
type Region = typeof REGIONS[number]

// Standard NCAA seed matchup order, top-to-bottom per region
const SEED_ORDER: [number, number][] = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15],
]

const REGION_COLOR: Record<Region, string> = {
  South:   'text-sky-400',
  East:    'text-emerald-400',
  Midwest: 'text-violet-400',
  West:    'text-orange-400',
}

const REGION_DOT: Record<Region, string> = {
  South:   'bg-sky-400',
  East:    'bg-emerald-400',
  Midwest: 'bg-violet-400',
  West:    'bg-orange-400',
}

// ─────────────────────────────────────────────────────────────────────────────
// Bracket logic helpers
// ─────────────────────────────────────────────────────────────────────────────
function findWinner(
  a: Team | null,
  b: Team | null,
  round: number,
  byRound: Map<number, FullResult[]>,
): Team | null {
  if (!a || !b) return null
  const match = (byRound.get(round) ?? []).find(
    r =>
      (r.winning_team_id === a.id && r.losing_team_id === b.id) ||
      (r.winning_team_id === b.id && r.losing_team_id === a.id),
  )
  return match?.winning_team ?? null
}

function buildRegion(
  teams: Record<number, Team>,
  byRound: Map<number, FullResult[]>,
): Slot[][] {
  const r1: Slot[] = SEED_ORDER.map(([s1, s2]) => {
    const top    = teams[s1] ?? null
    const bottom = teams[s2] ?? null
    return { top, bottom, winner: findWinner(top, bottom, 1, byRound) }
  })
  function advance(prev: Slot[], round: number): Slot[] {
    return Array.from({ length: prev.length / 2 }, (_, i) => {
      const top    = prev[i * 2].winner
      const bottom = prev[i * 2 + 1].winner
      return { top, bottom, winner: findWinner(top, bottom, round, byRound) }
    })
  }
  return [r1, advance(r1, 2), advance(advance(r1, 2), 3), advance(advance(advance(r1, 2), 3), 4)]
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG connector drawn between two adjacent round columns
// Draws: stub-right from each "from" matchup → vertical spine → stub-right to "to" matchup
// ─────────────────────────────────────────────────────────────────────────────
function RoundConnector({
  from,
  to,
}: {
  from: { cy: number }[]
  to:   { cy: number }[]
}) {
  const mid = CW / 2
  return (
    <svg
      width={CW}
      height={BH}
      className="flex-shrink-0"
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      <g stroke="rgba(255,255,255,0.18)" strokeWidth="1" fill="none" strokeLinecap="round">
        {to.map((t, i) => {
          const y0 = from[i * 2].cy
          const y1 = from[i * 2 + 1].cy
          return (
            <Fragment key={i}>
              {/* stub out from top feeder */}
              <line x1={0} y1={y0} x2={mid} y2={y0} />
              {/* vertical spine connecting both feeders */}
              <line x1={mid} y1={y0} x2={mid} y2={y1} />
              {/* stub out from bottom feeder */}
              <line x1={0} y1={y1} x2={mid} y2={y1} />
              {/* stub into the next-round matchup */}
              <line x1={mid} y1={t.cy} x2={CW} y2={t.cy} />
            </Fragment>
          )
        })}
      </g>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Single matchup card — two team rows separated by a 1px rule
// ─────────────────────────────────────────────────────────────────────────────
const ROW_H = (MH - 1) / 2   // height of each team row inside the card

function TeamRow({
  team,
  won,
  lost,
}: {
  team: Team | null
  won:  boolean
  lost: boolean
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 ${won ? 'bg-amber-500/15' : ''}`}
      style={{ height: ROW_H }}
    >
      {team ? (
        <>
          <span
            className={`inline-flex items-center justify-center rounded-full text-[9px] font-bold flex-shrink-0 ${getSeedBadgeColor(team.seed)}`}
            style={{ width: 15, height: 15 }}
          >
            {team.seed}
          </span>
          <span
            className={`text-[11px] leading-none truncate flex-1 ${
              won  ? 'text-amber-300 font-semibold' :
              lost ? 'text-white/22' :
                     'text-white/82'
            }`}
          >
            {team.name}
          </span>
          {won && (
            <span className="text-amber-500 text-[9px] flex-shrink-0 font-bold">▲</span>
          )}
        </>
      ) : (
        <span className="text-white/18 text-[10px] italic">TBD</span>
      )}
    </div>
  )
}

function MatchCard({
  slot,
  w = CARDW,
  h = MH,
}: {
  slot: Slot
  w?:   number
  h?:   number
}) {
  const topWon  = !!(slot.winner && slot.winner.id === slot.top?.id)
  const botWon  = !!(slot.winner && slot.winner.id === slot.bottom?.id)
  const settled = !!slot.winner
  const rowH    = (h - 1) / 2

  function Row({ team, won, lost }: { team: Team | null; won: boolean; lost: boolean }) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2 ${won ? 'bg-amber-500/15' : ''}`}
        style={{ height: rowH }}
      >
        {team ? (
          <>
            <span
              className={`inline-flex items-center justify-center rounded-full text-[9px] font-bold flex-shrink-0 ${getSeedBadgeColor(team.seed)}`}
              style={{ width: 15, height: 15 }}
            >
              {team.seed}
            </span>
            <span
              className={`text-[11px] leading-none truncate flex-1 ${
                won  ? 'text-amber-300 font-semibold' :
                lost ? 'text-white/22' :
                       'text-white/82'
              }`}
            >
              {team.name}
            </span>
            {won && <span className="text-amber-500 text-[9px] flex-shrink-0 font-bold">▲</span>}
          </>
        ) : (
          <span className="text-white/18 text-[10px] italic">TBD</span>
        )}
      </div>
    )
  }

  return (
    <div
      className={`border overflow-hidden rounded-sm flex-shrink-0 ${
        settled ? 'border-white/28' : 'border-white/10'
      } bg-[#0c1120]`}
      style={{ width: w, height: h }}
    >
      <Row team={slot.top}    won={topWon} lost={settled && !topWon} />
      <div className="border-t border-white/10" />
      <Row team={slot.bottom} won={botWon} lost={settled && !botWon} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// One region's full bracket: 4 round columns + 3 connector columns
// ─────────────────────────────────────────────────────────────────────────────
const ROUND_LABELS = ['R64', 'R32', 'S16', 'E8']

function RegionBracket({ region, slots }: { region: Region; slots: Slot[][] }) {
  return (
    <div className="flex-shrink-0">
      {/* Column headers */}
      <div className="flex items-center mb-2">
        {slots.map((_, ri) => (
          <Fragment key={ri}>
            {ri > 0 && <div style={{ width: CW }} />}
            <div
              className="text-center text-[9px] uppercase tracking-widest"
              style={{ width: CARDW }}
            >
              {ri === 0 ? (
                <span className={`font-bebas text-sm tracking-widest ${REGION_COLOR[region]}`}>
                  {region}
                </span>
              ) : (
                <span className="text-white/25">{ROUND_LABELS[ri]}</span>
              )}
            </div>
          </Fragment>
        ))}
      </div>

      {/* Bracket body — matchup columns interleaved with connector SVGs */}
      <div className="relative flex items-start" style={{ height: BH }}>
        {slots.map((roundSlots, ri) => (
          <Fragment key={ri}>
            {/* Matchup column: cards are absolutely placed at computed Y positions */}
            <div
              className="relative flex-shrink-0"
              style={{ width: CARDW, height: BH }}
            >
              {roundSlots.map((slot, mi) => (
                <div
                  key={mi}
                  className="absolute"
                  style={{ top: POS[ri][mi].top, left: 0 }}
                >
                  <MatchCard slot={slot} />
                </div>
              ))}
            </div>

            {/* SVG connector to the next round */}
            {ri < slots.length - 1 && (
              <RoundConnector from={POS[ri]} to={POS[ri + 1]} />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Final Four + Championship section
// Layout: [Semi1] ─┐
//                  ├── [Championship] → Champion badge
//         [Semi2] ─┘
// ─────────────────────────────────────────────────────────────────────────────
const FF_CARD_W  = 172
const FF_CARD_H  = 68
const FF_GAP     = 48   // gap between the two semi cards
const FF_CONN_W  = 28
const FF_H       = FF_CARD_H * 2 + FF_GAP    // 184

// Pre-compute FF connector geometry
const FF_TOP_CY  = FF_CARD_H / 2              // center of semi 1
const FF_BOT_TOP = FF_CARD_H + FF_GAP         // top of semi 2
const FF_BOT_CY  = FF_BOT_TOP + FF_CARD_H / 2 // center of semi 2
const FF_MID_CY  = (FF_TOP_CY + FF_BOT_CY) / 2 // championship center
const FF_CHAMP_TOP = FF_MID_CY - FF_CARD_H / 2

function FinalFour({
  semi1,
  semi2,
  championship,
  year,
}: {
  semi1:        Slot
  semi2:        Slot
  championship: Slot
  year:         string
}) {
  const connMid = FF_CONN_W / 2

  return (
    <div>
      <div className="font-bebas text-2xl tracking-widest text-amber-400 mb-6 text-center">
        FINAL FOUR &amp; CHAMPIONSHIP
      </div>

      <div className="flex items-start justify-center gap-0">
        {/* ── Left: two semifinal cards ── */}
        <div>
          <div className="text-[9px] text-white/30 uppercase tracking-widest text-center mb-1.5">
            South vs West
          </div>
          <div
            className="relative flex-shrink-0"
            style={{ width: FF_CARD_W, height: FF_H }}
          >
            <div className="absolute" style={{ top: 0 }}>
              <MatchCard slot={semi1} w={FF_CARD_W} h={FF_CARD_H} />
            </div>
            <div className="absolute text-[9px] text-white/30 uppercase tracking-widest text-center"
              style={{ top: FF_CARD_H + FF_GAP / 2 - 7, width: FF_CARD_W }}>
              East vs Midwest
            </div>
            <div className="absolute" style={{ top: FF_BOT_TOP }}>
              <MatchCard slot={semi2} w={FF_CARD_W} h={FF_CARD_H} />
            </div>
          </div>
        </div>

        {/* ── Center: SVG connector ── */}
        <svg
          width={FF_CONN_W}
          height={FF_H}
          className="flex-shrink-0"
          aria-hidden="true"
        >
          <g stroke="rgba(255,255,255,0.22)" strokeWidth="1" fill="none" strokeLinecap="round">
            <line x1={0}       y1={FF_TOP_CY}  x2={connMid} y2={FF_TOP_CY}  />
            <line x1={connMid} y1={FF_TOP_CY}  x2={connMid} y2={FF_BOT_CY}  />
            <line x1={0}       y1={FF_BOT_CY}  x2={connMid} y2={FF_BOT_CY}  />
            <line x1={connMid} y1={FF_MID_CY}  x2={FF_CONN_W} y2={FF_MID_CY} />
          </g>
        </svg>

        {/* ── Right: championship card + champion badge ── */}
        <div className="relative flex-shrink-0" style={{ width: FF_CARD_W + 160, height: FF_H }}>
          <div className="text-[9px] text-amber-400/60 uppercase tracking-widest text-center mb-1.5 absolute"
            style={{ top: FF_CHAMP_TOP - 16, width: FF_CARD_W }}>
            Championship
          </div>
          <div className="absolute" style={{ top: FF_CHAMP_TOP }}>
            <MatchCard slot={championship} w={FF_CARD_W} h={FF_CARD_H} />
          </div>

          {championship.winner ? (
            <div
              className="absolute flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2"
              style={{ top: FF_CHAMP_TOP + FF_CARD_H / 2 - 18, left: FF_CARD_W + 12 }}
            >
              <span
                className={`inline-flex items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0 ${getSeedBadgeColor(championship.winner.seed)}`}
                style={{ width: 20, height: 20 }}
              >
                {championship.winner.seed}
              </span>
              <div>
                <div className="text-amber-300 font-bold text-sm leading-none">
                  {championship.winner.name}
                </div>
                <div className="text-amber-500/70 text-[9px] uppercase tracking-widest mt-0.5">
                  {year || '…'} Champion
                </div>
              </div>
            </div>
          ) : (
            <div
              className="absolute text-white/20 text-[10px] italic"
              style={{ top: FF_CHAMP_TOP + FF_CARD_H / 2 - 8, left: FF_CARD_W + 12 }}
            >
              TBD
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Data hook
// ─────────────────────────────────────────────────────────────────────────────
function useBracket() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [byRegionSeed, setByRegionSeed] = useState<Record<string, Record<number, Team>>>({})
  const [byRound, setByRound] = useState<Map<number, FullResult[]>>(new Map())
  const [year, setYear] = useState<string>('')

  const load = useCallback(async () => {
    const [{ data: teams }, { data: results }, { data: yearSetting }] = await Promise.all([
      supabase.from('teams').select('*'),
      supabase
        .from('game_results')
        .select('*, winning_team:teams!game_results_winning_team_id_fkey(*), losing_team:teams!game_results_losing_team_id_fkey(*)')
        .order('round'),
      supabase.from('settings').select('value').eq('key', 'contest_year').single(),
    ])
    if (yearSetting?.value != null) setYear(String(yearSetting.value))

    const brs: Record<string, Record<number, Team>> = {}
    for (const t of (teams ?? []) as Team[]) {
      brs[t.region] ??= {}
      brs[t.region][t.seed] = t
    }

    const br = new Map<number, FullResult[]>()
    for (const r of (results ?? []) as FullResult[]) {
      const list = br.get(r.round) ?? []
      list.push(r)
      br.set(r.round, list)
    }

    setByRegionSeed(brs)
    setByRound(br)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase
      .channel('bracket-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_results' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, load])

  return { loading, byRegionSeed, byRound, year }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
type Tab = Region | 'Final Four'
const TABS: Tab[] = [...REGIONS, 'Final Four']

export default function BracketPage() {
  const { loading, byRegionSeed, byRound, year } = useBracket()
  const [activeTab, setActiveTab] = useState<Tab>('South')

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="font-bebas text-5xl tracking-widest leading-none mb-8">
          {year || '…'} <span className="text-amber-400">BRACKET</span>
        </h1>
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[536px] w-[640px] bg-white/3 rounded-xl animate-pulse flex-shrink-0" />
          ))}
        </div>
      </div>
    )
  }

  // Build slot arrays for all 4 regions
  const allSlots = Object.fromEntries(
    REGIONS.map(r => [r, buildRegion(byRegionSeed[r] ?? {}, byRound)])
  ) as Record<Region, Slot[][]>

  // Derive Final Four participants from Elite 8 winners
  const regionChamps = Object.fromEntries(
    REGIONS.map(r => [r, allSlots[r][3][0].winner])
  ) as Record<Region, Team | null>

  const semi1: Slot = {
    top:    regionChamps.South,
    bottom: regionChamps.West,
    winner: findWinner(regionChamps.South, regionChamps.West, 5, byRound),
  }
  const semi2: Slot = {
    top:    regionChamps.East,
    bottom: regionChamps.Midwest,
    winner: findWinner(regionChamps.East, regionChamps.Midwest, 5, byRound),
  }
  const championship: Slot = {
    top:    semi1.winner,
    bottom: semi2.winner,
    winner: findWinner(semi1.winner, semi2.winner, 6, byRound),
  }

  const totalResults = [1, 2, 3, 4, 5, 6].reduce(
    (n, r) => n + (byRound.get(r)?.length ?? 0), 0
  )

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-8">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="font-bebas text-5xl tracking-widest leading-none">
            {year || '…'} <span className="text-amber-400">BRACKET</span>
          </h1>
          <p className="text-white/35 text-sm mt-1">
            {totalResults} / 63 results entered · real-time updates
          </p>
        </div>
        <Link
          href="/enter"
          className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm px-5 py-2.5 rounded transition-colors"
        >
          MAKE YOUR PICKS
        </Link>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-5 text-xs text-white/40">
        {REGIONS.map(r => (
          <span key={r} className={`flex items-center gap-1.5 ${REGION_COLOR[r]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${REGION_DOT[r]}`} />
            {r}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-amber-400/70 ml-2">
          <span className="w-3 h-2 rounded-sm bg-amber-500/25 border border-amber-500/40" />
          Winner advancing
        </span>
        <span className="flex items-center gap-1.5 text-white/30 ml-2">
          <span className="w-3 h-px bg-white/20" />
          Bracket connector
        </span>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          MOBILE / TABLET  (< xl)  — tabbed single-region view
      ════════════════════════════════════════════════════════════════════ */}
      <div className="xl:hidden">
        {/* Tabs */}
        <div className="flex gap-1 mb-5 flex-wrap">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-1.5 rounded text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-amber-500 text-black'
                  : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto pb-6">
          {activeTab === 'Final Four' ? (
            <div className="flex justify-center min-w-max">
              <FinalFour semi1={semi1} semi2={semi2} championship={championship} year={year} />
            </div>
          ) : (
            <div className="min-w-max">
              <RegionBracket region={activeTab} slots={allSlots[activeTab]} />
            </div>
          )}
        </div>
        <p className="text-white/20 text-[11px] text-center mt-1">
          Scroll right to see all rounds
        </p>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          DESKTOP  (≥ xl)  — 2×2 region grid + Final Four below
      ════════════════════════════════════════════════════════════════════ */}
      <div className="hidden xl:block">
        {/* 2 × 2 grid of region brackets, each independently scrollable */}
        <div className="grid grid-cols-2 gap-x-10 gap-y-10 mb-14">
          {REGIONS.map(region => (
            <div key={region} className="overflow-x-auto pb-2">
              <RegionBracket region={region} slots={allSlots[region]} />
            </div>
          ))}
        </div>

        {/* Final Four */}
        <div className="border-t border-white/10 pt-10 flex justify-center">
          <FinalFour semi1={semi1} semi2={semi2} championship={championship} year={year} />
        </div>
      </div>
    </div>
  )
}
