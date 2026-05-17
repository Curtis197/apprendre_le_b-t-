'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import type { SupabaseClient } from '@supabase/supabase-js'

export function AuthNav() {
  const router = useRouter()
  const supabaseRef = useRef<SupabaseClient | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  function resolveName(user: { email?: string; user_metadata?: Record<string, unknown> } | null | undefined): string | null {
    if (!user) return null
    const name = user.user_metadata?.full_name as string | undefined
    return name?.trim() || user.email || null
  }

  useEffect(() => {
    const supabase = createClient()
    supabaseRef.current = supabase
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      setDisplayName(resolveName(data.user))
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setDisplayName(resolveName(session?.user))
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function handleSignOut() {
    await supabaseRef.current?.auth.signOut()
    router.refresh()
  }

  if (!ready) return <div className="ml-auto h-6 w-20" />

  if (!displayName) {
    return (
      <Link
        href="/auth"
        className="ml-auto text-sm text-muted-foreground hover:text-foreground"
      >
        Se connecter
      </Link>
    )
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      <span className="text-sm text-muted-foreground truncate max-w-[160px]" title={displayName}>
        {displayName}
      </span>
      <button
        onClick={handleSignOut}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Se déconnecter
      </button>
    </div>
  )
}
