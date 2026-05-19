import { createClient } from '@/lib/supabase-server'
import { LexiconEntry } from '@/components/LexiconEntry'
import { notFound } from 'next/navigation'
import type { LexiconEntry as TLexiconEntry, LexiconExample } from '@/lib/types'

export default async function LexiconEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('lexicon')
    .select('*, lexicon_examples(*)')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()

  const entry = data as TLexiconEntry & {
    lexicon_examples: LexiconExample[]
  }

  return (
    <main className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <LexiconEntry entry={entry} />
      {entry.lexicon_examples?.length > 0 && (
        <section>
          <h2 className="font-semibold mb-3">Exemples du Nouveau Testament</h2>
          <div className="space-y-2">
            {entry.lexicon_examples.map((ex) => (
              <div key={ex.id} className="border rounded p-3 text-sm space-y-1">
                <p className="font-mono">{ex.bete_snippet}</p>
                {ex.french_literal && (
                  <p className="text-muted-foreground">
                    <span className="font-medium">Mot à mot :</span> {ex.french_literal}
                  </p>
                )}
                <p className="text-muted-foreground">{ex.french_snippet}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
