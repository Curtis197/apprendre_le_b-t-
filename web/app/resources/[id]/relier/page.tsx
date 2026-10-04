import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { getCommunityText } from '@/lib/community'
import { getResourceWords } from '@/lib/word-blocks-data'
import { nonEmptyLines } from '@/lib/word-blocks'
import { readerWillShowWords, readiness, readinessMessage } from '@/lib/word-link-editor'
import { ResourceSteps } from '@/components/ResourceSteps'
import { WordLinkEditor } from '@/components/word-link/WordLinkEditor'

export const metadata: Metadata = {
  title: 'Relier les mots',
  robots: { index: false, follow: false },
}

export default async function LinkWordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth?next=/resources/${id}/relier`)

  const text = await getCommunityText(supabase, id)
  // Only the contributor links the words: anyone else gets the same 404 as a missing resource.
  if (!text || text.created_by !== user.id) notFound()

  const ready = readiness(text.content_bete, text.content_literal)
  const reader = ready.ok ? readerWillShowWords(text.content_bete, text.content_literal, text.content_french) : null
  const saved = ready.ok ? await getResourceWords(supabase, id) : []

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-10 py-10">
      <Link
        href={`/resources/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Retour à la ressource
      </Link>

      <ResourceSteps step={2} resourceId={id} />

      <h1 className="font-heading text-3xl font-bold mb-2">Relier les mots</h1>
      <p className="text-sm text-muted-foreground mb-8">
        {text.title}. Reliez chaque mot bhété à son mot à mot, vers par vers. Un marqueur grammatical peut rester sans sens :
        il pourra être précisé plus tard.
      </p>

      {ready.ok ? (
        <>
          <p className="-mt-6 mb-8 text-sm">
            <Link href={`/resources/${id}/edit`} className="text-primary underline underline-offset-2">
              Modifier le texte
            </Link>
          </p>
          {reader && !reader.ok && (
            <div className="mb-6 rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
              <p>{reader.message}</p>
              <Link href={`/resources/${id}/edit`} className="mt-2 inline-block text-primary underline underline-offset-2">
                Modifier la ressource
              </Link>
            </div>
          )}
          {(() => {
            const frenchLines = text.content_french ? nonEmptyLines(text.content_french) : null
            const beteLines = nonEmptyLines(text.content_bete)
            return (
              <WordLinkEditor
                resourceId={id}
                beteLines={beteLines}
                literalLines={nonEmptyLines(text.content_literal ?? '')}
                saved={saved}
                region={text.region ?? null}
                frenchLines={frenchLines && frenchLines.length === beteLines.length ? frenchLines : null}
                signedIn
              />
            )
          })()}
        </>
      ) : (
        <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
          <p>{readinessMessage(ready)}</p>
          <Link href={`/resources/${id}/edit`} className="mt-2 inline-block text-primary underline underline-offset-2">
            Modifier la ressource
          </Link>
        </div>
      )}
    </div>
  )
}
