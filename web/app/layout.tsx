// web/app/layout.tsx
import type { Metadata } from 'next'
import { Inter, Lexend } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { DialectProvider } from '@/context/DialectContext'
import { ErudaLoader } from '@/components/ErudaLoader'

const inter  = Inter({ subsets: ['latin'], variable: '--font-inter' })
const lexend = Lexend({ subsets: ['latin'], variable: '--font-lexend', weight: ['400', '600', '700'] })

export const metadata: Metadata = {
  title: 'Apprendre le bhété — Plateforme linguistique',
  description: 'Lexique, traducteur et ressources pour la langue bhété'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${inter.variable} ${lexend.variable}`}>
        {/* TEMP: Eruda mobile DevTools — only loads when NEXT_PUBLIC_ENABLE_ERUDA=1 */}
        {process.env.NEXT_PUBLIC_ENABLE_ERUDA === '1' && <ErudaLoader />}
        <Navbar />
        <DialectProvider>
          <main>{children}</main>
        </DialectProvider>
      </body>
    </html>
  )
}
