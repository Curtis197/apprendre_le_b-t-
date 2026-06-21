import { cache } from 'react'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { LexiconEntry } from '@/components/LexiconEntry'
import { notFound } from 'next/navigation'
import type { LexiconEntry as TLexiconEntry, LexiconExample } from '@/lib/types'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL } from '@/lib/site'
import { cleanBeteForm } from '@/lib/lexicon'

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
  const western = cleanBeteForm(entry.bete_phonetic)   // everyday western-Latin form
  const ipa = cleanBeteForm(entry.bete_word)           // IPA / Bible phonetic form
  const bete = western || ipa

  // Not yet translated → keep out of the index (thin content) but still reachable.
  if (!bete) {
    return {
      title: `${french} en bété`,
      description: `« ${french} » dans le lexique bété (bhété) — cette entrée attend sa traduction. Contribuez sur Apprendre le bhété.`,
      alternates: { canonical: `/lexicon/${id}` },
      robots: { index: false, follow: true },
    }
  }

  const title = `${french} en bété : ${bete}`
  const forms = [
    western && `« ${western} »`,
    ipa && ipa !== western && `forme phonétique « ${ipa} »`,
  ].filter(Boolean).join(', ')
  const description = `Traduction bété (bhété) de « ${french} » : ${forms}. Prononciation et exemples du Nouveau Testament.`

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

  const french = entry.top_french?.trim()
  const western = cleanBeteForm(entry.bete_phonetic)
  const ipa = cleanBeteForm(entry.bete_word)
  const bete = western || ipa
  const label = bete || french || 'Mot'

  const jsonLd = [
    // Only describe a real dictionary term once the entry has a translation.
    ...(bete
      ? [{
          '@context': 'https://schema.org',
          '@type': 'DefinedTerm',
          name: bete,
          ...(french && {
            description:
              `« ${french} » en bété (bhété)` +
              (western ? `, forme courante : ${western}` : '') +
              (ipa ? `, forme phonétique : ${ipa}` : '') + '.',
          }),
          url: `${SITE_URL}/lexicon/${id}`,
          inDefinedTermSet: {
            '@type': 'DefinedTermSet',
            name: 'Lexique bété-français',
            url: `${SITE_URL}/lexicon`,
          },
        }]
      : []),
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Lexique', item: `${SITE_URL}/lexicon` },
        { '@type': 'ListItem', position: 3, name: label, item: `${SITE_URL}/lexicon/${id}` },
      ],
    },
  ]

  return (
    <main className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <JsonLd data={jsonLd} />
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
