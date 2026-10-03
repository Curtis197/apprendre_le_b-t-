import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { findUsages, normalizeSide } from '@/lib/usages'
import { UsageList } from '@/components/UsageList'
import { PageHeader } from '@/components/PageHeader'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Usages d’un mot',
  description: 'Où un mot bhété ou français est utilisé dans les chansons, contes, proverbes et exemples de la communauté.',
  robots: { index: false, follow: true },   // result pages depend on the query: keep them out of the index
}

const PAGE_SIZE = 20

export default async function UsagesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; side?: string }>
}) {
  const { q = '', side: rawSide } = await searchParams
  const side = normalizeSide(rawSide)
  const query = q.trim().slice(0, 100)
  const result = query ? await findUsages(await createClient(), { q: query, side, limit: PAGE_SIZE }) : null

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <PageHeader
        badge="Contexte"
        title="Usages d’un mot"
        subtitle="Retrouvez les phrases de la communauté où un mot est utilisé, avec ses variantes d’orthographe."
      />

      <form action="/usages" method="get" className="flex flex-col sm:flex-row gap-2">
        <Input name="q" defaultValue={query} placeholder="Un mot…" className="text-base" aria-label="Mot recherché" />
        <select name="side" defaultValue={side} className="border rounded px-3 py-2 text-sm" aria-label="Langue du mot">
          <option value="bete">Bhété</option>
          <option value="fr">Français</option>
        </select>
        <Button type="submit">Chercher</Button>
      </form>

      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}

      {result && !result.error && result.rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucun usage trouvé pour « {query} ». L’orthographe du bhété varie : essayez une autre écriture du mot.
        </p>
      )}

      {result && result.rows.length > 0 && (
        <UsageList key={`${side}:${query}`} initialRows={result.rows} total={result.total} q={query} side={side} pageSize={PAGE_SIZE} />
      )}

      {side === 'fr' && query && (
        <p className="text-xs text-muted-foreground">
          Depuis le français, seules les ressources dont le texte et la traduction ont le même nombre de lignes sont retrouvées.
        </p>
      )}
    </div>
  )
}
