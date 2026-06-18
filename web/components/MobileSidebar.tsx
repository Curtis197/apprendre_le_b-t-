'use client'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
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
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()

  // Portal target must be accessed client-side only
  useEffect(() => { setMounted(true) }, [])

  // Close on route change
  useEffect(() => { setOpen(false) }, [pathname])

  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const overlay = (
    <>
      {/* Backdrop — portalled to body so backdrop-filter on header doesn't trap it */}
      {open && (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.4)',
            touchAction: 'none',
          }}
        />
      )}

      {/* Slide-in drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: '288px', zIndex: 9999,
          display: 'flex', flexDirection: 'column',
          background: 'var(--color-background, #fff)',
          borderRight: '1px solid var(--color-border, #e5e7eb)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.12)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 220ms ease',
          willChange: 'transform',
        }}
      >
        {/* Drawer header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', height: '72px',
          borderBottom: '1px solid var(--color-border, #e5e7eb)', flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-primary, #1d4ed8)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/logo.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
            Apprendre le bhété
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
            style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: 'none' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 24px', textDecoration: 'none',
                  fontSize: '0.9375rem',
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--color-primary, #1d4ed8)' : 'var(--color-muted-foreground, #6b7280)',
                  background: active ? 'color-mix(in srgb, var(--color-primary, #1d4ed8) 8%, transparent)' : 'transparent',
                  borderRight: active ? '3px solid var(--color-primary, #1d4ed8)' : '3px solid transparent',
                }}
              >
                <Icon size={20} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: 24, borderTop: '1px solid var(--color-border, #e5e7eb)', flexShrink: 0 }}>
          <AuthNav />
          <p style={{ fontSize: '0.75rem', color: 'var(--color-muted-foreground, #6b7280)', marginTop: 12 }}>
            Apprendre le bhété v1.0
          </p>
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Hamburger button — stays inside the header */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu"
        aria-expanded={open}
        className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Overlay portalled to document.body — escapes the header's backdrop-filter containing block */}
      {mounted && createPortal(overlay, document.body)}
    </>
  )
}
