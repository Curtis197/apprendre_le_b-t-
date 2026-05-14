// web/app/lexicon/page.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { FilterPills } from '@/components/FilterPills'
import { WordCard } from '@/components/WordCard'
import { createClient } from '@/lib/supabase-browser'
import type { LexiconEntry } from '@/lib/types'

const CATEGORIES = ['Tous', 'Noms', 'Verbes', 'Adjectifs']
const PAGE_SIZE = 9

const POS_MAP: Record<string, string> = {
  Noms: 'noun',
  Verbes: 'verb',
  Adjectifs: 'adj',
}

export default function LexiconPage() {
  const [category, setCategory] = useState('Tous')
  const [entries, setEntries] = useState<LexiconEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    setPage(0)
  }, [category])

  useEffect(() => {
    setLoading(true)
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let q = supabaseRef.current
      .from('lexicon')
      .select('*', { count: 'exact' })
      .order('upvotes', { ascending: false })
      .range(from, to)
    if (category !== 'Tous' && POS_MAP[category]) {
      q = q.ilike('pos', `%${POS_MAP[category]}%`)
    }
    q.then(({ data, count }) => {
      setEntries((data ?? []) as LexiconEntry[])
      setTotal(count ?? 0)
      setLoading(false)
    })
  }, [category, page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const [featured, ...rest] = entries

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Dictionnaire"
        title="Lexique Bété"
        subtitle="Explorez les mots de la langue bété, leur prononciation et leur traduction en français."
      />

      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <FilterPills options={CATEGORIES} value={category} onChange={setCategory} />
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
          {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className={`w-10 h-10 rounded-full text-sm font-semibold transition-colors ${
                page === i
                  ? 'bg-primary text-white'
                  : 'border border-border hover:bg-muted'
              }`}
            >
              {i + 1}
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
