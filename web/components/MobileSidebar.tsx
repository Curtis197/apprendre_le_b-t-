// web/components/MobileSidebar.tsx
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Home, BookOpen, BookText, MessageCircle, Layers, PlusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AuthNav } from './AuthNav'

const links = [
  { href: '/', label: 'Accueil', icon: Home },
  { href: '/lexicon', label: 'Lexique', icon: BookOpen },
  { href: '/grammar', label: 'Grammaire', icon: BookText },
  { href: '/forum', label: 'Forum', icon: MessageCircle },
  { href: '/resources', label: 'Ressources', icon: Layers },
  { href: '/contribute', label: 'Contribuer', icon: PlusCircle },
]

export function MobileSidebar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Lock body scroll when sidebar opens
  useEffect(() => {
    document.documentElement.style.overflow = open ? 'hidden' : ''
    return () => { document.documentElement.style.overflow = '' }
  }, [open])

  // Close sidebar on Escape key
  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
        aria-label="Ouvrir le menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-72 bg-background border-r border-border flex flex-col md:hidden">
            <div className="flex items-center justify-between px-6 h-[72px] border-b border-border shrink-0">
              <span className="font-heading font-bold text-xl text-primary">Bété Lingo</span>
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
                const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-6 py-4 text-base transition-colors border-l-4',
                      isActive
                        ? 'bg-primary/10 text-primary border-primary font-semibold'
                        : 'text-foreground hover:bg-muted border-transparent'
                    )}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </nav>
            <div className="px-6 py-4 border-t border-border shrink-0">
              <AuthNav />
              <p className="text-xs text-muted-foreground mt-3">Parlons Bété v1.0</p>
            </div>
          </div>
        </>
      )}
    </>
  )
}
