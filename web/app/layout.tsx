import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Link from 'next/link'
import { AuthNav } from '@/components/AuthNav'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Bété — Plateforme linguistique',
  description: 'Lexique, traducteur et ressources pour la langue bété',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        <header className="border-b">
          <nav className="max-w-2xl mx-auto px-4 py-3 flex gap-6 items-center">
            <Link href="/" className="font-bold text-lg">Bété</Link>
            <Link href="/lexicon" className="text-sm text-muted-foreground hover:text-foreground">
              Lexique
            </Link>
            <Link href="/translator" className="text-sm text-muted-foreground hover:text-foreground">
              Traducteur
            </Link>
            <Link href="/contribute" className="text-sm text-muted-foreground hover:text-foreground">
              Contribuer
            </Link>
            <AuthNav />
          </nav>
        </header>
        {children}
      </body>
    </html>
  )
}
