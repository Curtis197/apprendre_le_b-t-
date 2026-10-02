import { cache } from 'react'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { LexiconEntry } from '@/components/LexiconEntry'
import { LexiconTranslations } from '@/components/LexiconTranslations'
import { LexiconDescription } from '@/components/LexiconDescription'
import { notFound } from 'next/navigation'
import type { LexiconEntry as TLexiconEntry, LexiconExample, LexiconTranslation } from '@/lib/types'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL } from '@/lib/site'
import { cleanBeteForm, pickDescription, sortTranslations, translationsSummary } from '@/lib/lexicon'
import { InterlinearGloss } from '@/components/InterlinearGloss'

type Entry = TLexiconEntry & {
  lexicon_examples: LexiconExample[]
  lexicon_translations: LexiconTranslation[]
}

function truncateDescription(text: string, max = 160): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…'
}

// Cached so generateMetadata and the page share a single DB query per request.
const getEntry = cache(async (id: string): Promise<Entry | null> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lexicon')
    .select('*, lexicon_examples(*), lexicon_translations(*)')
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

  const translations = sortTranslations(entry.lexicon_translations ?? [])
  const french = translations[0]?.french ?? (entry.top_french?.trim() || 'Mot')
  const allFrench = translationsSummary(translations) || french
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

  const descText = pickDescription(entry)
  const description = descText
    ? truncateDescription(descText)
    : `Traduction bété (bhété) de « ${allFrench} » : ${forms}. Prononciation et exemples du Nouveau Testament.`

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

  const translations = sortTranslations(entry.lexicon_translations ?? [])
  const french = translations[0]?.french ?? (entry.top_french?.trim() || 'Mot')
  const allFrench = translationsSummary(translations) || french
  const western = cleanBeteForm(entry.bete_phonetic)
  const ipa = cleanBeteForm(entry.bete_word)
  const bete = western || ipa
  const label = bete || french || 'Mot'
  const descText = pickDescription(entry)

  const jsonLd = [
    // Only describe a real dictionary term once the entry has a translation.
    ...(bete
      ? [{
          '@context': 'https://schema.org',
          '@type': 'DefinedTerm',
          name: bete,
          ...(french && {
            description:
              `« ${allFrench} » en bété (bhété)` +
              (western ? `, forme courante : ${western}` : '') +
              (ipa ? `, forme phonétique : ${ipa}` : '') +
              (descText ? ` — ${descText}` : '') + '.',
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
      <LexiconDescription lexiconId={entry.id} initial={descText} />
      <LexiconTranslations lexiconId={entry.id} translations={translations} />
      {entry.lexicon_examples?.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg font-heading">Exemples</h2>
          <div className="space-y-3">
            {entry.lexicon_examples.map((ex) => (
              <InterlinearGloss
                key={ex.id}
                original={ex.bete_snippet}
                literal={ex.french_literal}
                final={ex.french_snippet}
                variant="compact"
              />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
