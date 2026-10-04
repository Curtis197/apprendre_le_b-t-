import { cache } from 'react'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { LexiconEntry } from '@/components/LexiconEntry'
import { LexiconTranslations } from '@/components/LexiconTranslations'
import { LexiconDescription } from '@/components/LexiconDescription'
import { CorrectionBox } from '@/components/CorrectionBox'
import { notFound } from 'next/navigation'
import type { LexiconEntry as TLexiconEntry, LexiconExample, LexiconTranslation } from '@/lib/types'
import { JsonLd } from '@/components/JsonLd'
import { SITE_URL } from '@/lib/site'
import { cleanBeteForm, pickDescription, sortTranslations, translationsSummary } from '@/lib/lexicon'
import { InterlinearGloss } from '@/components/InterlinearGloss'
import { findUsages } from '@/lib/usages'
import { UsageCard } from '@/components/UsageCard'
import Link from 'next/link'

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

  // Not yet translated or empty marker → keep out of the index (thin content) but still reachable.
  if (!bete || (entry.entry_kind === 'marker' && !entry.marker_meaning)) {
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
  // The entry's own examples are listed in "Exemples" above: leave them out of "Usages".
  const usages = bete ? await findUsages(await createClient(), { q: bete, limit: 5, excludeRef: id }) : null

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
      {entry.entry_kind === 'marker' && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
              Marqueur grammatical
            </span>
          </div>
          {entry.marker_meaning ? (
            <div className="space-y-1.5 text-sm">
              <p>
                <span className="font-medium text-muted-foreground">Type : </span>
                {entry.marker_type || '—'}
              </p>
              <p>
                <span className="font-medium text-muted-foreground">Ce qu’il indique : </span>
                {entry.marker_meaning}
              </p>
              {entry.marker_french && (
                <p>
                  <span className="font-medium text-muted-foreground">Comment le français le rend : </span>
                  {entry.marker_french}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sens à préciser</p>
          )}
        </section>
      )}
      <LexiconDescription lexiconId={entry.id} initial={descText} />
      {bete && (
        <CorrectionBox
          targetType="word"
          targetId={entry.id}
          ownerId={entry.created_by ?? null}
          fields={[
            { field: 'bete_phonetic', current: entry.bete_phonetic },
            { field: 'bete_word', current: entry.bete_word },
            { field: 'description', current: entry.description },
          ]}
        />
      )}
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
      {usages && usages.rows.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg font-heading">Usages</h2>
          <div className="space-y-3">
            {usages.rows.map(row => <UsageCard key={row.line_id} row={row} side="bete" />)}
          </div>
          {usages.total > usages.rows.length && (
            <Link href={`/lexicon/${id}/usages`} className="text-sm text-primary hover:underline font-medium">
              Voir tous les usages ({usages.total}) →
            </Link>
          )}
        </section>
      )}
    </main>
  )
}
