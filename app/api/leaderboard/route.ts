import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  // Fetch all entries and scored rows in parallel.
  // The leaderboard view uses INNER JOINs and returns nothing before any
  // games are scored — so we always base the list on the entries table and
  // overlay scores from the view when they exist.
  const [{ data: entries, error: entriesErr }, { data: scored }] = await Promise.all([
    supabase
      .from('entries')
      .select('id, participant_name, paid, tiebreaker_total, submitted_at')
      .order('submitted_at', { ascending: true }),
    supabase.from('leaderboard').select('entry_id, total_points, total_wins, upset_count'),
  ])

  if (entriesErr) return NextResponse.json({ error: entriesErr.message }, { status: 500 })

  // Build a lookup map from the scored view
  const scoreMap = new Map(
    (scored ?? []).map(r => [r.entry_id, r])
  )

  // Merge: every entry gets scores from the view, defaulting to 0
  const merged = (entries ?? []).map(e => ({
    entry_id:        e.id,
    participant_name: e.participant_name,
    paid:            e.paid,
    tiebreaker_total: e.tiebreaker_total,
    submitted_at:    e.submitted_at,
    total_points:    scoreMap.get(e.id)?.total_points  ?? 0,
    total_wins:      scoreMap.get(e.id)?.total_wins    ?? 0,
    upset_count:     scoreMap.get(e.id)?.upset_count   ?? 0,
  }))

  // Sort: most points first; ties broken by submitted_at ascending (earlier = better)
  merged.sort((a, b) =>
    b.total_points - a.total_points ||
    new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
  )

  return NextResponse.json(merged)
}
