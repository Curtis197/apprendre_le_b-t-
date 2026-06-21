'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import type { SupabaseClient } from '@supabase/supabase-js'

const NAV_LINKS = [
  { href: '/lexicon',    label: 'Lexique' },
  { href: '/grammar',   label: 'Grammaire' },
  { href: '/forum',     label: 'Forum' },
  { href: '/resources', label: 'Ressources' },
  { href: '/contribute',label: 'Contribuer' },
  { href: '/contact',   label: 'Contact' },
]

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

export function Navbar() {
  const pathname = usePathname()
  const router   = useRouter()

  const [menuOpen,    setMenuOpen]    = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [authReady,   setAuthReady]   = useState(false)
  const supabaseRef = useRef<SupabaseClient | null>(null)

  useEffect(() => { setMenuOpen(false) }, [pathname])

  useEffect(() => {
    const supabase = createClient()
    supabaseRef.current = supabase
    let alive = true

    async function resolveName(userId: string, fallback: string) {
      const { data } = await supabase.from('profiles').select('name').eq('id', userId).maybeSingle()
      return data?.name?.trim() || fallback
    }

    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive) return
      if (data.user) {
        setDisplayName(data.user.email ?? data.user.id)
        const name = await resolveName(data.user.id, data.user.email ?? '')
        if (alive) setDisplayName(name)
      }
      setAuthReady(true)
    }).catch(() => { if (alive) setAuthReady(true) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED' && !session) {
        await supabase.auth.signOut()
        if (alive) setDisplayName(null)
        return
      }
      if (session?.user) {
        if (alive) { setDisplayName(session.user.email ?? session.user.id); setAuthReady(true) }
        const name = await resolveName(session.user.id, session.user.email ?? '')
        if (alive) setDisplayName(name)
      } else {
        if (alive) { setDisplayName(null); setAuthReady(true) }
      }
    })

    const onVisible = () => {
      if (document.visibilityState === 'visible')
        supabase.auth.getUser().then(({ data }) => { if (alive && !data.user) setDisplayName(null) })
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      alive = false
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  async function handleSignOut() {
    await supabaseRef.current?.auth.signOut()
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">

      {/* Nav bar */}
      <div className="max-w-7xl mx-auto px-4 md:px-10 h-16 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0 font-heading font-bold text-lg text-primary">
          <img src="/logo.png" alt="Apprendre le bhété" className="w-8 h-8 object-contain" />
          <span className="hidden sm:inline">Apprendre le bhété</span>
          <span className="sm:hidden">Bhété</span>
        </Link>

        {/* Desktop links */}
        <nav className="hidden md:flex items-center gap-1 flex-1 ml-4">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive(pathname, href)
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Desktop auth */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {!authReady ? (
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
          ) : displayName ? (
            <>
              <Link
                href="/profile"
                className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors truncate max-w-[140px]"
                title={displayName}
              >
                {displayName}
              </Link>
              <button
                onClick={handleSignOut}
                className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                Se déconnecter
              </button>
            </>
          ) : (
            <>
              <Link
                href="/auth"
                className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                Se connecter
              </Link>
              <Link
                href="/auth"
                className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                S&apos;inscrire
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu trigger — hamburger icon */}
        <button
          type="button"
          onClick={() => setMenuOpen(o => !o)}
          className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        >
          {menuOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu — inside <header>, normal block element, no fixed/absolute positioning */}
      {menuOpen && (
        <div id="mobile-menu" className="md:hidden border-t border-border px-4 py-3 space-y-1" style={{ backgroundColor: 'var(--background, #fbf9f5)' }}>
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive(pathname, href)
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              {label}
            </Link>
          ))}

          <div className="pt-2 border-t border-border space-y-1">
            {!authReady ? (
              <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
            ) : displayName ? (
              <>
                <Link
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  {displayName}
                </Link>
                <button
                  onClick={() => { setMenuOpen(false); handleSignOut() }}
                  className="block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  Se déconnecter
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  Se connecter
                </Link>
                <Link
                  href="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
                >
                  S&apos;inscrire
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
