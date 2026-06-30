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
    console.log('[AuthNav] fetchName — querying profiles for user:', userId)
    const supabase = supabaseRef.current!
    const { data, error } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', userId)
      .maybeSingle()
    if (error) console.error('[AuthNav] fetchName error:', error.message, error.code)
    const result = data?.name?.trim() || fallback
    console.log('[AuthNav] fetchName — resolved:', result)
    return result
  }

  useEffect(() => {
    const supabase = createClient()
    supabaseRef.current = supabase
    let active = true
    console.log('[AuthNav] mount — starting auth init')

    supabase.auth.getUser()
      .then(({ data }) => {
        console.log('[AuthNav] getUser result:', data.user ? `user=${data.user.id} email=${data.user.email}` : 'no user')
        if (!active) return
        if (data.user) {
          setDisplayName(data.user.email ?? data.user.id)
          fetchName(data.user.id, data.user.email ?? '').then(name => {
            console.log('[AuthNav] fetchName result:', name)
            if (active) setDisplayName(name)
          }).catch(err => console.error('[AuthNav] fetchName error:', err))
        }
        setReady(true)
      })
      .catch((err) => {
        console.error('[AuthNav] getUser error:', err)
        if (active) setReady(true)
      })

    // IMPORTANT: never call other Supabase methods directly inside this callback — the
    // client holds an internal lock while dispatching the event, and a nested auth/data
    // call (even from another component sharing the same client) re-enters that lock and
    // deadlocks every pending Supabase call on the page. Defer with setTimeout per
    // Supabase's documented workaround: https://github.com/supabase/auth-js/issues/762
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthNav] onAuthStateChange:', event, session ? `user=${session.user?.id}` : 'no session')
      if (event === 'TOKEN_REFRESHED' && !session) {
        console.warn('[AuthNav] TOKEN_REFRESHED with no session — signing out stale session')
        setTimeout(() => {
          supabase.auth.signOut().then(() => {
            setDisplayName(null)
            setReady(true)
          })
        }, 0)
        return
      }
      if (session?.user) {
        setDisplayName(session.user.email ?? session.user.id)
        setReady(true)
        setTimeout(() => {
          fetchName(session.user.id, session.user.email ?? '').then(name => {
            console.log('[AuthNav] onAuthStateChange fetchName result:', name)
            setDisplayName(name)
          }).catch(err => console.error('[AuthNav] onAuthStateChange fetchName error:', err))
        }, 0)
      } else {
        console.log('[AuthNav] onAuthStateChange — clearing displayName')
        setDisplayName(null)
        setReady(true)
      }
    })

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[AuthNav] tab visible — re-checking session')
        supabase.auth.getUser().then(({ data }) => {
          console.log('[AuthNav] visibility getUser:', data.user ? `user=${data.user.id}` : 'no user')
          if (!data.user) setDisplayName(null)
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      console.log('[AuthNav] unmount — cleaning up listeners')
      active = false
      sub.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  async function handleSignOut() {
    console.log('[AuthNav] user clicked sign out')
    await supabaseRef.current?.auth.signOut()
    console.log('[AuthNav] signOut complete — refreshing router')
    router.refresh()
  }

  if (!ready) {
    console.log('[AuthNav] render: skeleton placeholder (not ready yet)')
    return <div className="ml-auto h-6 w-20" />
  }

  if (!displayName) {
    console.log('[AuthNav] render: "Se connecter" button (no user)')
    return (
      <Link href="/auth" className="ml-auto text-sm text-muted-foreground hover:text-foreground">
        Se connecter
      </Link>
    )
  }

  console.log('[AuthNav] render: user nav — displayName:', displayName)
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
