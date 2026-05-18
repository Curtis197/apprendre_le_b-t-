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

  async function fetchName(userId: string, fallback: string): Promise<string> {
    const supabase = supabaseRef.current!
    const { data } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', userId)
      .maybeSingle()
    return data?.name?.trim() || fallback
  }

  useEffect(() => {
    const supabase = createClient()
    supabaseRef.current = supabase
    let active = true

    supabase.auth.getUser()
      .then(async ({ data }) => {
        if (!active) return
        if (data.user) {
          const name = await fetchName(data.user.id, data.user.email ?? '')
          if (active) setDisplayName(name)
        }
        if (active) setReady(true)
      })
      .catch(() => {
        if (active) setReady(true)
      })

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED' && !session) {
        await supabase.auth.signOut()
        setDisplayName(null)
        setReady(true)
        return
      }
      if (session?.user) {
        const name = await fetchName(session.user.id, session.user.email ?? '')
        setDisplayName(name)
      } else {
        setDisplayName(null)
      }
      setReady(true)
    })

    // Re-check session when user returns to the tab after leaving
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getUser().then(({ data }) => {
          if (!data.user) setDisplayName(null)
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      active = false
      sub.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  async function handleSignOut() {
    await supabaseRef.current?.auth.signOut()
    router.refresh()
  }

  if (!ready) return <div className="ml-auto h-6 w-20" />

  if (!displayName) {
    return (
      <Link href="/auth" className="ml-auto text-sm text-muted-foreground hover:text-foreground">
        Se connecter
      </Link>
    )
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      <Link
        href="/profile"
        className="text-sm text-muted-foreground hover:text-foreground truncate max-w-[160px]"
        title={displayName}
      >
        {displayName}
      </Link>
      <button
        onClick={handleSignOut}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Se déconnecter
      </button>
    </div>
  )
}
