'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import type { SupabaseClient } from '@supabase/supabase-js'

export function AuthNav() {
  const router = useRouter()
  const supabaseRef = useRef<SupabaseClient | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabaseRef.current = supabase
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return
      setEmail(data.user?.email ?? null)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null)
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

  if (!email) {
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
      <Link
        href="/profile"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Mon profil
      </Link>
      <span className="text-xs text-muted-foreground truncate max-w-[140px]" title={email}>
        {email}
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
