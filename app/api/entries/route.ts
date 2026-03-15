import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { validatePicks } from '@/lib/scoring'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { participantName, participantEmail, teamIds } = body

  if (!participantName?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  if (!participantEmail?.trim()) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  if (!EMAIL_RE.test(participantEmail.trim())) {
    return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
  }

  if (!Array.isArray(teamIds) || teamIds.length === 0) {
    return NextResponse.json({ error: 'Team picks required' }, { status: 400 })
  }

  const supabase = await createClient()

  // Check deadline (skip if BYPASS_DEADLINE=true in env, for testing)
  if (process.env.BYPASS_DEADLINE !== 'true') {
    const { data: deadlineSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'entry_deadline')
      .single()

    if (deadlineSetting) {
      const deadlineStr = typeof deadlineSetting.value === 'string'
        ? deadlineSetting.value.replace(/^"|"$/g, '')
        : String(deadlineSetting.value)
      const deadline = new Date(deadlineStr)
      if (new Date() > deadline) {
        return NextResponse.json({ error: 'Entry deadline has passed' }, { status: 400 })
      }
    }
  }

  // Get team seeds for validation
  const { data: teams } = await supabase
    .from('teams')
    .select('id, seed')
    .in('id', teamIds)

  if (!teams || teams.length !== teamIds.length) {
    return NextResponse.json({ error: 'Invalid team IDs' }, { status: 400 })
  }

  const picks = teams.map((t: { id: string; seed: number }) => ({ teamId: t.id, seed: t.seed }))
  const validation = validatePicks(picks)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  // Insert entry
  const { data: entry, error: entryError } = await supabase
    .from('entries')
    .insert({
      participant_name: participantName.trim(),
      participant_email: participantEmail.trim().toLowerCase(),
    })
    .select()
    .single()

  if (entryError) {
    const msg = entryError.message.includes('unique') || entryError.code === '23505'
      ? 'Something went wrong saving your entry. Please try again.'
      : entryError.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Insert picks
  const { error: picksError } = await supabase
    .from('entry_picks')
    .insert(teamIds.map((teamId: string) => ({ entry_id: entry.id, team_id: teamId })))

  if (picksError) return NextResponse.json({ error: picksError.message }, { status: 500 })

  return NextResponse.json({ success: true, entryId: entry.id })
}
