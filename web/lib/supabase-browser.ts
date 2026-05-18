// lib/supabase-browser.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Persist session across browser closes (uses cookies, not sessionStorage)
        persistSession: true,
        // Automatically refresh the token when the tab regains focus
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  )
}
