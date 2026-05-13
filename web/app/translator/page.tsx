export const dynamic = 'force-dynamic'

import { TranslatorInput } from '@/components/TranslatorInput'

export default function TranslatorPage() {
  return (
    <main className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-2">Traducteur Français → Bété</h1>
      <p className="text-muted-foreground mb-6">
        Chaque mot est aligné avec sa correspondance en bété.
        Signalez les erreurs pour améliorer le lexique.
      </p>
      <TranslatorInput />
    </main>
  )
}
