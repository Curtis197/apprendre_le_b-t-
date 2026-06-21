import { createClient } from '@supabase/supabase-js'

// Cookie-free anon client for public reads (sitemap, etc.). Avoids next/headers
// cookies() so callers like sitemap.ts aren't forced to be dynamic per-request.
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
