import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()

  // Must be authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Delete in FK-safe order: picks → entries → results
  // entry_picks has ON DELETE CASCADE from entries, but we delete explicitly for clarity
  const { error: picksError } = await supabase
    .from('entry_picks')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (picksError) {
    return NextResponse.json({ error: `Failed to clear picks: ${picksError.message}` }, { status: 500 })
  }

  const { error: entriesError } = await supabase
    .from('entries')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (entriesError) {
    return NextResponse.json({ error: `Failed to clear entries: ${entriesError.message}` }, { status: 500 })
  }

  const { error: resultsError } = await supabase
    .from('game_results')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (resultsError) {
    return NextResponse.json({ error: `Failed to clear results: ${resultsError.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
