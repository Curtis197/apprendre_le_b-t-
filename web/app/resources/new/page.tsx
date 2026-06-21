// web/app/resources/new/page.tsx
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ResourceSubmitForm } from '@/components/ResourceSubmitForm'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Proposer une ressource',
  robots: { index: false, follow: true },
}

export default function NewResourcePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 md:px-10 py-10">
      <Link
        href="/resources"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Retour aux ressources
      </Link>

      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold mb-2">Soumettre une ressource</h1>
        <p className="text-muted-foreground text-sm">
          Partagez une chanson, un conte, un poème, un proverbe ou tout autre texte en bhété.
          Votre contribution sera visible après validation par l&apos;équipe.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <ResourceSubmitForm />
      </div>
    </div>
  )
}
