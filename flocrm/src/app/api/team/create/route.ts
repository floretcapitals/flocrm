import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { name, email, password, role, reports_to } = await req.json()
  
  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name }
  })

  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

  const { error: profileErr } = await admin.from('profiles').insert({
    id: authUser.user.id,
    name,
    role,
    reports_to: reports_to || null,
    is_active: true
  })

  if (profileErr) {
    await admin.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ error: profileErr.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, id: authUser.user.id })
}
