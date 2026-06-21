import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Se connecter',
  description: 'Connectez-vous ou créez un compte pour contribuer à Apprendre le bhété.',
  robots: { index: false, follow: true },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
