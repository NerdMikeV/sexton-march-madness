import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function checkAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase.from('settings').select('value').eq('key', 'admin_emails').single()
  if (!data) return true // Allow if no admin setting configured yet

  const emails = (data.value as { email: string }[]).map((e) => e.email)
  return user.email ? emails.includes(user.email) : false
}

export async function GET() {
  const supabase = await createClient()
  if (!(await checkAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data, error } = await supabase
    .from('game_results')
    .select('*, winning_team:teams!game_results_winning_team_id_fkey(*), losing_team:teams!game_results_losing_team_id_fkey(*)')
    .order('entered_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!(await checkAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { winningTeamId, losingTeamId, round } = await req.json()

  if (!winningTeamId || !losingTeamId || !round) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (winningTeamId === losingTeamId) {
    return NextResponse.json({ error: 'Teams must be different' }, { status: 400 })
  }

  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('game_results')
    .insert({
      winning_team_id: winningTeamId,
      losing_team_id: losingTeamId,
      round,
      entered_by: user?.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
