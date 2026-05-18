import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  console.log('[auth/callback] GET — code present:', !!code, '| next:', next)

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error:', error.message)
    } else {
      console.log('[auth/callback] exchangeCodeForSession success — user:', data.user?.id, '| redirecting to:', next)
      return Response.redirect(`${origin}${next}`)
    }
  } else {
    console.warn('[auth/callback] no code param in request')
  }

  console.warn('[auth/callback] redirecting to error page')
  return Response.redirect(`${origin}/auth?error=callback`)
}
