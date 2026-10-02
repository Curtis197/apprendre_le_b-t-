import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { cleanBeteForm } from '@/lib/lexicon'
import { findUsages } from '@/lib/usages'
import { UsageList } from '@/components/UsageList'

export const metadata: Metadata = { title: 'Usages du mot', robots: { index: false, follow: true } }

const PAGE_SIZE = 20

export default async function WordUsagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: entry } = await supabase.from('lexicon').select('bete_phonetic, bete_word').eq('id', id).maybeSingle()
  if (!entry) notFound()

  const word = cleanBeteForm(entry.bete_phonetic) || cleanBeteForm(entry.bete_word)
  if (!word) notFound()
  const { rows, total, error } = await findUsages(supabase, { q: word, limit: PAGE_SIZE })

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <Link href={`/lexicon/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="w-4 h-4" /> Retour au mot
      </Link>
      <h1 className="font-heading text-2xl font-bold">Usages de « {word} »</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && rows.length === 0 && <p className="text-sm text-muted-foreground">Aucun usage trouvé pour ce mot.</p>}
      <UsageList initialRows={rows} total={total} q={word} side="bete" pageSize={PAGE_SIZE} />
    </main>
  )
}
