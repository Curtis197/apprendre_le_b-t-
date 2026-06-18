'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, X } from 'lucide-react'
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

function active(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

export function Navbar() {
  const pathname = usePathname()
  const router   = useRouter()

  const [menuOpen,     setMenuOpen]     = useState(false)
  const [displayName,  setDisplayName]  = useState<string | null>(null)
  const [authReady,    setAuthReady]    = useState(false)
  const supabaseRef = useRef<SupabaseClient | null>(null)

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false) }, [pathname])

  // Auth state
  useEffect(() => {
    const supabase = createClient()
    supabaseRef.current  = supabase
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

    return () => { alive = false; subscription.unsubscribe(); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  async function handleSignOut() {
    await supabaseRef.current?.auth.signOut()
    router.refresh()
  }

  return (
    /* Sticky wrapper — backdrop-blur is scoped to the inner header only,
       so the mobile dropdown (a sibling) is never trapped by it. */
    <div className="sticky top-0 z-50">

      {/* ── Desktop bar ─────────────────────────────────────────────────── */}
      <header className="bg-background/95 backdrop-blur border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-10 h-[72px] flex items-center gap-6">

          {/* Logo */}
          <Link href="/" className="font-heading font-bold text-xl text-primary shrink-0 flex items-center gap-2">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
            <span className="hidden sm:inline">Apprendre le bhété</span>
            <span className="sm:hidden">Bhété</span>
          </Link>

          {/* Desktop links */}
          <nav className="hidden md:flex items-center gap-6 flex-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`text-sm pb-0.5 transition-colors whitespace-nowrap ${
                  active(pathname, href)
                    ? 'border-b-2 border-primary text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Desktop auth */}
          <div className="hidden md:flex items-center gap-3 ml-auto shrink-0">
            {!authReady ? (
              <div className="h-5 w-20 animate-pulse rounded bg-muted" />
            ) : displayName ? (
              <>
                <Link
                  href="/profile"
                  className="text-sm text-muted-foreground hover:text-foreground truncate max-w-[140px]"
                  title={displayName}
                >
                  {displayName}
                </Link>
                <span className="text-border">|</span>
                <button
                  onClick={handleSignOut}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Se déconnecter
                </button>
              </>
            ) : (
              <Link
                href="/auth"
                className="text-sm font-medium px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Se connecter
              </Link>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            className="md:hidden ml-auto p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* ── Mobile dropdown — NOT inside backdrop-blur ───────────────────── */}
      {menuOpen && (
        <div className="md:hidden bg-background border-b border-border shadow-lg">
          <nav className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-0.5">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active(pathname, href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {label}
              </Link>
            ))}

            {/* Mobile auth */}
            <div className="mt-2 pt-2 border-t border-border">
              {!authReady ? (
                <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />
              ) : displayName ? (
                <>
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors truncate"
                  >
                    {displayName}
                  </Link>
                  <button
                    onClick={() => { setMenuOpen(false); handleSignOut() }}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    Se déconnecter
                  </button>
                </>
              ) : (
                <Link
                  href="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center mx-3 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Se connecter
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </div>
  )
}
