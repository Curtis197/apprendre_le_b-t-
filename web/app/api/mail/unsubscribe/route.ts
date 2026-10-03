import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { applyPreferenceChange } from '@/lib/mail/unsubscribe'

export const dynamic = 'force-dynamic'

/**
 * RFC 8058 one-click target (mail clients POST a form body here) and the endpoint behind the
 * confirmation page. The token in the query string identifies the user; no login is needed.
 */
export async function POST(request: Request) {
  const url = new URL(request.url)
  const body = (await request.json().catch(() => ({}))) as { subscribe?: unknown }
  const result = await applyPreferenceChange(
    createServiceClient(),
    url.searchParams.get('token'),
    url.searchParams.get('category'),
    body.subscribe === true,
  )
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
