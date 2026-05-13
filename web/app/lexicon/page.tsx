import { LexiconSearch } from '@/components/LexiconSearch'

export default function LexiconPage() {
  return (
    <main className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-2">Lexique Bété</h1>
      <p className="text-muted-foreground mb-6">
        Recherchez un mot en français ou en bété (forme phonétique).
      </p>
      <LexiconSearch />
    </main>
  )
}
