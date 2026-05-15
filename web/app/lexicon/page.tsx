// web/app/lexicon/page.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { FilterPills } from '@/components/FilterPills'
import { WordCard } from '@/components/WordCard'
import { createClient } from '@/lib/supabase-browser'
import type { LexiconEntry } from '@/lib/types'
import { DialectSelector } from '@/components/DialectSelector'
import { useDialect } from '@/context/DialectContext'

const FILTERS: { label: string; tag: string | null }[] = [
  { label: 'Tous',      tag: null },
  { label: 'Noms',      tag: 'noun' },
  { label: 'Verbes',    tag: 'verb' },
  { label: 'Adjectifs', tag: 'adj' },
  { label: 'Famille',   tag: 'family' },
  { label: 'Religion',  tag: 'religion' },
  { label: 'Nature',    tag: 'nature' },
  { label: 'Animaux',   tag: 'animal' },
]
const FILTER_LABELS = FILTERS.map(f => f.label)
const PAGE_SIZE = 9

export default function LexiconPage() {
  const [category, setCategory] = useState('Tous')
  const [entries, setEntries] = useState<LexiconEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef(createClient())
  const { dialect } = useDialect()

  useEffect(() => { setPage(0) }, [category, dialect])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const filter = FILTERS.find(f => f.label === category)

    let q = supabaseRef.current
      .from('lexicon')
      .select('*', { count: 'exact' })
      // Always hide garbage fragment entries
      .not('pos', 'cs', '{"fragment"}')
      .eq('dialect', dialect)
      .order('upvotes', { ascending: false })
      .range(from, to)

    if (filter?.tag) {
      q = q.contains('pos', [filter.tag])
    }

    q.then(({ data, count, error }) => {
      if (cancelled) return
      if (!error) {
        setEntries((data ?? []) as LexiconEntry[])
        setTotal(count ?? 0)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [category, page, dialect])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const [featured, ...rest] = entries

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Dictionnaire"
        title="Lexique Bété"
        subtitle="Explorez les mots de la langue bété, leur prononciation et leur traduction en français."
      />

      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <DialectSelector />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <FilterPills options={FILTER_LABELS} value={category} onChange={setCategory} />
        <span className="text-sm text-muted-foreground shrink-0">
          {loading ? '…' : `${total} mot${total !== 1 ? 's' : ''} trouvé${total !== 1 ? 's' : ''}`}
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className="bg-muted rounded-xl h-48 animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm py-10 text-center">
          Aucun mot trouvé pour cette catégorie.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {featured && (
            <WordCard
              key={featured.id}
              entry={featured}
              featured
              className="md:col-span-2 xl:col-span-1"
            />
          )}
          {rest.map(entry => (
            <WordCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-10">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="w-10 h-10 border border-border rounded-full flex items-center justify-center hover:bg-muted disabled:opacity-40 transition-colors"
            aria-label="Page précédente"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {Array.from(
            { length: Math.min(totalPages, 5) },
            (_, i) => Math.max(0, Math.min(page - 2, totalPages - 5)) + i
          ).map(pageNum => (
            <button
              key={pageNum}
              onClick={() => setPage(pageNum)}
              className={`w-10 h-10 rounded-full text-sm font-semibold transition-colors ${
                page === pageNum
                  ? 'bg-primary text-white'
                  : 'border border-border hover:bg-muted'
              }`}
            >
              {pageNum + 1}
            </button>
          ))}
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="w-10 h-10 border border-border rounded-full flex items-center justify-center hover:bg-muted disabled:opacity-40 transition-colors"
            aria-label="Page suivante"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
