// web/app/layout.tsx
import type { Metadata } from 'next'
import { Inter, Lexend } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { DialectProvider } from '@/context/DialectContext'
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, SITE_KEYWORDS, SITE_OG_IMAGE } from '@/lib/site'

const inter  = Inter({ subsets: ['latin'], variable: '--font-inter' })
const lexend = Lexend({ subsets: ['latin'], variable: '--font-lexend', weight: ['400', '600', '700'] })

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [{ url: SITE_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [SITE_OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${inter.variable} ${lexend.variable}`}>
        <Navbar />
        <DialectProvider>
          <main>{children}</main>
        </DialectProvider>
      </body>
    </html>
  )
}
