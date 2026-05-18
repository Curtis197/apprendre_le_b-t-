import 'server-only'
// lib/supabase-server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
            console.log('[supabase-server] setAll cookies written:', cookiesToSet.map(c => c.name))
          } catch {
            console.warn('[supabase-server] setAll blocked (Server Component context) — cookies:', cookiesToSet.map(c => c.name))
          }
        },
      },
    }
  )
}
