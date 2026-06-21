import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Behind Vercel's proxy, `request.url`'s origin can be an internal host (or even
  // localhost), so prefer the public host from x-forwarded-host (per Supabase's SSR
  // guide). Falls back to `origin` locally / when the header is absent.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
  const isLocalEnv = process.env.NODE_ENV === 'development'
  const baseUrl = isLocalEnv || !forwardedHost ? origin : `${forwardedProto}://${forwardedHost}`
  console.log('[auth/callback] GET — code present:', !!code, '| next:', next, '| baseUrl:', baseUrl)

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error:', error.message)
    } else {
      console.log('[auth/callback] exchangeCodeForSession success — user:', data.user?.id, '| redirecting to:', next)
      return NextResponse.redirect(`${baseUrl}${next}`)
    }
  } else {
    console.warn('[auth/callback] no code param in request')
  }

  console.warn('[auth/callback] redirecting to error page')
  return NextResponse.redirect(`${baseUrl}/auth?error=callback`)
}
