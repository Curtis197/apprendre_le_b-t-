// web/components/MobileSidebar.tsx
'use client'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Home, BookOpen, BookText, MessageCircle, Layers, PlusCircle, Phone } from 'lucide-react'
import { cn } from '@/lib/utils'
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

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    document.documentElement.style.overflow = open ? 'hidden' : ''
    return () => { document.documentElement.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open])

  const panel = open && mounted && createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/40 z-[200] cursor-pointer"
        onClick={() => setOpen(false)}
      />
      <div className="fixed inset-y-0 left-0 z-[201] w-72 bg-background border-r border-border flex flex-col">
        <div className="flex items-center justify-between px-6 h-[72px] border-b border-border shrink-0">
          <span className="font-heading font-bold text-xl text-primary flex items-center gap-2">
            <img src="/logo.png" alt="Apprendre le bhété Logo" className="w-8 h-8 object-contain" />
            Apprendre le bhété
          </span>
          <button
            onClick={() => setOpen(false)}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
            aria-label="Fermer le menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
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
                    ? 'bg-primary/10 text-primary font-medium border-r-4 border-primary' 
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="p-6 border-t border-border shrink-0">
          <AuthNav />
          <p className="text-xs text-muted-foreground mt-3">Apprendre le bhété v1.0</p>
        </div>
      </div>
    </>,
    document.body
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
        aria-label="Ouvrir le menu"
      >
        <Menu className="w-5 h-5" />
      </button>
      {panel}
    </>
  )
}
