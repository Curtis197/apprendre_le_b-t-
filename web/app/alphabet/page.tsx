import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { AlphabetReference } from '@/components/AlphabetReference'

export const metadata: Metadata = {
  title: 'Alphabet du bhété',
  description: 'Les lettres et signes utilisés pour écrire le bhété (ɛ, ɔ, ɩ, ʋ, ŋ, voyelles à tréma, marques de ton), par dialecte, avec leur fréquence dans le Nouveau Testament.',
  alternates: { canonical: '/alphabet' },
}

export default function AlphabetPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-10">
      <PageHeader
        badge="Alphabet"
        title="Alphabet du bhété"
        subtitle="Les symboles à connaître pour lire et écrire le bhété, dialecte par dialecte."
      />
      <AlphabetReference />
      <section className="mt-12 max-w-prose space-y-2 border-t border-border pt-6">
        <h2 className="font-heading text-lg font-bold">Pour aller plus loin</h2>
        <p className="text-sm text-muted-foreground">
          Plusieurs de ces lettres (ɛ, ɔ, ŋ) viennent de l’alphabet phonétique international ; ɩ et ʋ viennent de
          l’Alphabet africain de référence.
        </p>
        <a
          href="https://www.ipachart.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-primary hover:underline"
        >
          Écouter les sons du tableau de l’API (ipachart.com) →
        </a>
      </section>
    </div>
  )
}
