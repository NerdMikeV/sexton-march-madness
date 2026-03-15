import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Complete 2025 NCAA Tournament results — 63 games
// Format: [winner_name, loser_name, round]
// Notes:
//   - Florida is champion (beat Houston 65-63)
//   - All four #1 seeds made the Final Four
//   - Several notable upsets: McNeese (12) over Clemson (5) & Purdue (4),
//     Colorado State (12) over Memphis (5) & Maryland (4),
//     Illinois (11) over Xavier (6), Drake (11) over Missouri (6),
//     Arkansas (10) over Kansas (7), Gonzaga (9) over Georgia (8)
const RESULTS_2025: [string, string, number][] = [
  // ── ROUND 1 (Round of 64) ────────────────────────────────────────────────
  // South
  ['Auburn',        'Alabama State',    1],
  ['Louisville',    'Creighton',        1],
  ['Michigan',      'UC San Diego',     1],
  ['Texas A&M',     'Yale',             1],
  ['North Carolina','Ole Miss',         1],
  ['Iowa State',    'Lipscomb',         1],
  ['Marquette',     'New Mexico',       1],
  ['Michigan State','Bryant',           1],
  // East
  ['Duke',          "Mount St. Mary's", 1],
  ['Baylor',        'Mississippi State',1],
  ['Oregon',        'Liberty',          1],
  ['Arizona',       'Akron',            1],
  ['BYU',           'VCU',              1],
  ['Wisconsin',     'Montana',          1],
  ["Saint Mary's",  'Vanderbilt',       1],
  ['Alabama',       'Robert Morris',    1],
  // Midwest
  ['Houston',       'SIU Edwardsville', 1],
  ['Gonzaga',       'Georgia',          1],  // 9 over 8
  ['McNeese',       'Clemson',          1],  // 12 over 5 — upset
  ['Purdue',        'High Point',       1],
  ['Illinois',      'Xavier',           1],  // 11 over 6 — upset
  ['Kentucky',      'Troy',             1],
  ['UCLA',          'Utah State',       1],
  ['Tennessee',     'Wofford',          1],
  // West
  ['Florida',       'Norfolk State',    1],
  ['UConn',         'Oklahoma',         1],
  ['Colorado State','Memphis',          1],  // 12 over 5 — upset
  ['Maryland',      'Grand Canyon',     1],
  ['Drake',         'Missouri',         1],  // 11 over 6 — upset
  ['Texas Tech',    'UNC Wilmington',   1],
  ['Arkansas',      'Kansas',           1],  // 10 over 7 — upset
  ["St. John's",    'Omaha',            1],

  // ── ROUND 2 (Round of 32) ───────────────────────────────────────────────
  // South
  ['Auburn',        'Louisville',       2],
  ['Texas A&M',     'Michigan',         2],
  ['Iowa State',    'North Carolina',   2],
  ['Michigan State','Marquette',        2],
  // East
  ['Duke',          'Baylor',           2],
  ['Arizona',       'Oregon',           2],
  ['Wisconsin',     'BYU',              2],
  ['Alabama',       "Saint Mary's",     2],
  // Midwest
  ['Houston',       'Gonzaga',          2],
  ['McNeese',       'Purdue',           2],  // 12 over 4 — upset
  ['Kentucky',      'Illinois',         2],
  ['Tennessee',     'UCLA',             2],
  // West
  ['Florida',       'UConn',            2],
  ['Colorado State','Maryland',         2],  // 12 over 4 — upset
  ['Texas Tech',    'Drake',            2],
  ["St. John's",    'Arkansas',         2],

  // ── ROUND 3 (Sweet 16) ──────────────────────────────────────────────────
  ['Auburn',        'Texas A&M',        3],
  ['Michigan State','Iowa State',       3],
  ['Duke',          'Arizona',          3],
  ['Alabama',       'Wisconsin',        3],
  ['Houston',       'McNeese',          3],
  ['Tennessee',     'Kentucky',         3],
  ['Florida',       'Colorado State',   3],
  ["St. John's",    'Texas Tech',       3],

  // ── ROUND 4 (Elite 8) ───────────────────────────────────────────────────
  ['Auburn',        'Michigan State',   4],
  ['Duke',          'Alabama',          4],
  ['Houston',       'Tennessee',        4],
  ['Florida',       "St. John's",       4],

  // ── ROUND 5 (Final Four) ────────────────────────────────────────────────
  // South (Auburn) vs West (Florida) — same semifinal side
  ['Florida',       'Auburn',           5],
  // East (Duke) vs Midwest (Houston)
  ['Houston',       'Duke',             5],

  // ── ROUND 6 (Championship) ──────────────────────────────────────────────
  ['Florida',       'Houston',          6],  // Florida 65-63
]

export async function POST() {
  const supabase = await createClient()

  // Verify admin auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch all teams for name→id lookup
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name, seed, region')

  if (teamsError || !teams) {
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 })
  }

  const teamByName = new Map<string, string>()
  for (const t of teams) {
    teamByName.set(t.name, t.id)
  }

  // Validate all names resolve before touching the DB
  const missing: string[] = []
  for (const [winner, loser] of RESULTS_2025) {
    if (!teamByName.has(winner)) missing.push(winner)
    if (!teamByName.has(loser)) missing.push(loser)
  }
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Teams not found in DB: ${[...new Set(missing)].join(', ')}` },
      { status: 400 }
    )
  }

  // Clear all existing results first
  const { error: deleteError } = await supabase
    .from('game_results')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // delete all rows

  if (deleteError) {
    return NextResponse.json({ error: `Failed to clear results: ${deleteError.message}` }, { status: 500 })
  }

  // Insert all 63 results
  const rows = RESULTS_2025.map(([winner, loser, round]) => ({
    winning_team_id: teamByName.get(winner)!,
    losing_team_id: teamByName.get(loser)!,
    round,
    entered_by: user.id,
  }))

  const { error: insertError } = await supabase.from('game_results').insert(rows)

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, count: rows.length })
}
