import Link from 'next/link'
import { Languages } from 'lucide-react'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'

export const metadata: Metadata = {
  title: 'Traducteur français → bhété',
  description: 'Le traducteur automatique français → bhété n’est pas encore disponible : il a besoin d’un lexique, d’une grammaire et d’exemples.',
  alternates: { canonical: '/translator' },
}

export default function TranslatorPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Traducteur"
        title="Traducteur Français → Bhété"
        subtitle="Un traducteur automatique est prévu pour accompagner l’apprentissage de la langue."
      />

      <div className="bg-card border border-border rounded-xl p-6 md:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Languages className="w-6 h-6 text-primary" />
          <span className="text-sm font-semibold rounded-full bg-muted px-3 py-1 text-muted-foreground">
            Non disponible pour le moment
          </span>
        </div>
        <p className="text-foreground/80 leading-relaxed">
          Pour traduire correctement, le traducteur a besoin de s’appuyer sur le lexique, sur la grammaire
          et sur de nombreux exemples de phrases. Tant que ces bases ne sont pas assez remplies, il ne
          peut pas être mis en ligne.
        </p>
        <p className="text-foreground/80 leading-relaxed mt-3">
          Vous pouvez l’aider à voir le jour en ajoutant des mots, des règles de grammaire et des exemples.
        </p>
        <div className="flex gap-3 flex-wrap mt-6">
          <Link
            href="/contribute"
            className="bg-primary text-primary-foreground font-semibold px-6 h-10 inline-flex items-center rounded-lg text-sm hover:bg-primary/90 transition-colors"
          >
            Contribuer
          </Link>
          <Link
            href="/lexicon"
            className="border border-border font-semibold px-6 h-10 inline-flex items-center rounded-lg text-sm hover:bg-muted transition-colors"
          >
            Voir le lexique
          </Link>
        </div>
      </div>
    </div>
  )
}
