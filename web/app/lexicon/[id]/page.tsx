import { cache } from 'react'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { LexiconEntry } from '@/components/LexiconEntry'
import { notFound } from 'next/navigation'
import type { LexiconEntry as TLexiconEntry, LexiconExample } from '@/lib/types'

type Entry = TLexiconEntry & { lexicon_examples: LexiconExample[] }

// Cached so generateMetadata and the page share a single DB query per request.
const getEntry = cache(async (id: string): Promise<Entry | null> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lexicon')
    .select('*, lexicon_examples(*)')
    .eq('id', id)
    .maybeSingle()
  return (data as Entry) ?? null
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const entry = await getEntry(id)
  if (!entry) return { title: 'Mot introuvable', robots: { index: false } }

  const french = entry.top_french?.trim() || 'Mot'
  const western = entry.bete_phonetic?.trim()   // everyday western-Latin form
  const ipa = entry.bete_word?.trim()           // IPA / Bible phonetic form
  const bete = western || ipa

  const title = bete ? `${french} en bété : ${bete}` : `${french} en bété`
  const forms = [
    western && `« ${western} »`,
    ipa && ipa !== western && `forme phonétique « ${ipa} »`,
  ].filter(Boolean).join(', ')
  const description = bete
    ? `Traduction bété (bhété) de « ${french} » : ${forms}. Prononciation et exemples du Nouveau Testament.`
    : `« ${french} » dans le lexique bété (bhété) — aidez à le traduire sur Apprendre le bhété.`

  return {
    title,
    description,
    alternates: { canonical: `/lexicon/${id}` },
    openGraph: { title, description, type: 'article', url: `/lexicon/${id}` },
  }
}

export default async function LexiconEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const entry = await getEntry(id)

  if (!entry) notFound()

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
