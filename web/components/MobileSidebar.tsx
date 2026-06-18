'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Home, BookOpen, BookText, MessageCircle, Layers, PlusCircle, Phone } from 'lucide-react'
import { AuthNav } from './AuthNav'

const links = [
  { href: '/', label: 'Accueil', icon: Home },
  { href: '/lexicon', label: 'Lexique', icon: BookOpen },
  { href: '/grammar', label: 'Grammaire', icon: BookText },
  { href: '/forum', label: 'Forum', icon: MessageCircle },
  { href: '/resources', label: 'Ressources', icon: Layers },
  { href: '/contribute', label: 'Contribuer', icon: PlusCircle },
  { href: '/contact', label: 'Contact', icon: Phone },
]

export function MobileSidebar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on route change
  useEffect(() => { setOpen(false) }, [pathname])

  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* Hamburger button — shown only on mobile */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu"
        aria-expanded={open}
        className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[60] bg-black/40"
          style={{ touchAction: 'none' }}
        />
      )}

      {/* Slide-in drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        className={`fixed top-0 left-0 bottom-0 z-[61] flex flex-col w-72 bg-background border-r border-border shadow-xl transition-transform duration-250 ease-in-out md:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ willChange: 'transform' }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-6 h-[72px] border-b border-border shrink-0">
          <span className="font-heading font-bold text-lg text-primary flex items-center gap-2">
            <img src="/logo.png" alt="" className="w-8 h-8 object-contain" />
            Apprendre le bhété
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-6 py-3 transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary font-semibold border-r-4 border-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Drawer footer */}
        <div className="p-6 border-t border-border shrink-0">
          <AuthNav />
          <p className="text-xs text-muted-foreground mt-3">Apprendre le bhété v1.0</p>
        </div>
      </div>
    </>
  )
}
