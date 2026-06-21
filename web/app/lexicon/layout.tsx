import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Lexique bété-français',
  description:
    'Dictionnaire collaboratif bété (bhété) ↔ français : des milliers de mots avec leur prononciation et des exemples du Nouveau Testament.',
  alternates: { canonical: '/lexicon' },
}

export default function LexiconLayout({ children }: { children: React.ReactNode }) {
  return children
}
