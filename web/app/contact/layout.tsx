import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contactez l’équipe d’Apprendre le bhété pour toute question sur la langue bété.',
  alternates: { canonical: '/contact' },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children
}
