import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

async function checkAdmin(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('settings').select('value').eq('key', 'admin_emails').single()
  if (!data) return true
  const emails = (data.value as { email: string }[]).map((e) => e.email)
  return user.email ? emails.includes(user.email) : false
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  if (!(await checkAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { csv } = await req.json()
  if (!csv) return NextResponse.json({ error: 'CSV data required' }, { status: 400 })

  const lines = csv.trim().split('\n').filter((l: string) => l.trim())
  const teams: { seed: number; name: string; region: string }[] = []
  const errors: string[] = []

  const validRegions = ['East', 'West', 'South', 'Midwest']

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue

    const parts = line.split(',').map((p: string) => p.trim())
    if (parts.length < 3) {
      errors.push(`Line ${i + 1}: Expected format "seed,name,region" — got "${line}"`)
      continue
    }

    const seed = parseInt(parts[0])
    if (isNaN(seed) || seed < 1 || seed > 16) {
      errors.push(`Line ${i + 1}: Invalid seed "${parts[0]}" — must be 1-16`)
      continue
    }

    const name = parts[1]
    if (!name) {
      errors.push(`Line ${i + 1}: Missing team name`)
      continue
    }

    const region = parts[2]
    if (!validRegions.includes(region)) {
      errors.push(`Line ${i + 1}: Invalid region "${region}" — must be East, West, South, or Midwest`)
      continue
    }

    teams.push({ seed, name, region })
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('\n') }, { status: 400 })
  }

  if (teams.length === 0) {
    return NextResponse.json({ error: 'No valid teams found' }, { status: 400 })
  }

  const { error } = await supabase.from('teams').upsert(teams, { onConflict: 'seed,region' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, count: teams.length })
}
