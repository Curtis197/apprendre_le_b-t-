export const dynamic = 'force-dynamic'

import { TranslatorInput } from '@/components/TranslatorInput'
import { DialectSelector } from '@/components/DialectSelector'

export default function TranslatorPage() {
  return (
    <main className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-2">Traducteur Français → Bété</h1>
      <p className="text-muted-foreground mb-4">
        Chaque mot est aligné avec sa correspondance en bété.
        Signalez les erreurs pour améliorer le lexique.
      </p>
      <div className="mb-6"><DialectSelector /></div>
      <TranslatorInput />
    </main>
  )
}
