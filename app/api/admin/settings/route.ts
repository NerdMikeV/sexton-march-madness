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

export async function PUT(req: NextRequest) {
  const supabase = createClient()
  if (!(await checkAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  const updates = Object.entries(body).map(([key, value]) => ({
    key,
    value: JSON.stringify(value),
  }))

  for (const update of updates) {
    const { error } = await supabase
      .from('settings')
      .upsert({ key: update.key, value: update.value }, { onConflict: 'key' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
