// web/app/layout.tsx
import type { Metadata } from 'next'
import { Inter, Lexend } from 'next/font/google'
import './globals.css'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { AuthNav } from '@/components/AuthNav'
import { NavLink } from '@/components/NavLink'
import { MobileSidebar } from '@/components/MobileSidebar'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const lexend = Lexend({ subsets: ['latin'], variable: '--font-lexend', weight: ['400', '600', '700'] })

export const metadata: Metadata = {
  title: 'Bété Lingo — Plateforme linguistique',
  description: 'Lexique, traducteur et ressources pour la langue bété',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${inter.variable} ${lexend.variable}`}>
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border shadow-sm">
          <nav className="max-w-7xl mx-auto px-4 md:px-10 h-[72px] flex items-center gap-6">
            <Link href="/" className="font-heading font-bold text-xl text-primary shrink-0">
              Bété Lingo
            </Link>
            <div className="hidden md:flex items-center gap-8 flex-1">
              <NavLink href="/lexicon">Lexique</NavLink>
              <NavLink href="/grammar">Grammaire</NavLink>
              <NavLink href="/contribute">Contribuer</NavLink>
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <div className="hidden md:flex items-center gap-2 bg-muted rounded-full px-4 py-2 text-sm text-muted-foreground cursor-text">
                <Search className="w-4 h-4 shrink-0" />
                <span>Rechercher…</span>
              </div>
              <div className="hidden md:block">
                <AuthNav />
              </div>
              <MobileSidebar />
            </div>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
