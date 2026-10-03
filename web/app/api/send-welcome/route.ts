import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { SITE_URL } from '@/lib/site'
import { sendEmail } from '@/lib/mail/send'
import { renderWelcomeEmail } from '@/lib/mail/templates'

export const dynamic = 'force-dynamic'

/** Welcome email for the signed-in user only: the address comes from the session, never from the request body. */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })

  const meta = user.user_metadata as { full_name?: unknown } | null
  const name = typeof meta?.full_name === 'string' && meta.full_name.trim() ? meta.full_name : user.email.split('@')[0]

  const result = await sendEmail({ to: user.email, ...renderWelcomeEmail({ name, baseUrl: SITE_URL }) })
  if (!result.ok) {
    console.error('[send-welcome] failed:', result.error)
    return NextResponse.json({ error: 'Email sending failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
