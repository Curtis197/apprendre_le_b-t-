// web/components/MobileSidebar.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Home, BookOpen, BookText, MessageCircle, Layers, PlusCircle, Phone } from 'lucide-react'
import { AuthNav } from './AuthNav'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle
} from "@/components/ui/sheet"

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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg hover:bg-muted transition-colors cursor-pointer"
          aria-label="Ouvrir le menu"
        >
          <Menu className="w-5 h-5 pointer-events-none" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 flex flex-col border-r border-border">
        <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
        <div className="flex items-center px-6 h-[72px] border-b border-border shrink-0">
          <span className="font-heading font-bold text-xl text-primary flex items-center gap-2">
            <img src="/logo.png" alt="Apprendre le bhété Logo" className="w-8 h-8 object-contain" />
            Apprendre le bhété
          </span>
        </div>
        <nav className="flex-1 py-4 overflow-y-auto">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-6 py-3 transition-colors cursor-pointer ${
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
      </SheetContent>
    </Sheet>
  )
}

