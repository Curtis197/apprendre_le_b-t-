import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Espace enseignant',
  robots: { index: false, follow: false },
}

export default function TeachLayout({ children }: { children: React.ReactNode }) {
  return children
}
