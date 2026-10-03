// web/app/lexicon/page.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { FilterPills } from '@/components/FilterPills'
import { WordCard, type WordCardEntry } from '@/components/WordCard'
import { createClient } from '@/lib/supabase-browser'
import { DialectSelector } from '@/components/DialectSelector'
import { useDialect } from '@/context/DialectContext'
import { Input } from '@/components/ui/input'
import { otherMeaningsLabel, translationCount } from '@/lib/lexicon'
import { searchLexicon } from '@/lib/lexicon-search'
import Link from 'next/link'

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

const TAG_LABELS: Record<string, string> = {
  noun: 'Nom', verb: 'Verbe', adj: 'Adj.', adv: 'Adv.',
  name: 'Nom propre', num: 'Num.', interj: 'Interj.',
  prep: 'Prép.', conj: 'Conj.', pron: 'Pron.',
  family: 'Famille', nature: 'Nature', body: 'Corps',
  religion: 'Religion', animal: 'Animal', food: 'Alimentation',
  place: 'Lieu', time: 'Temps', action: 'Action',
}

function primaryLabel(pos: string[] | null): string {
  if (!pos?.length) return 'Mot'
  return TAG_LABELS[pos[0]] ?? pos[0]
}

type LexiconListEntry = WordCardEntry & {
  matchedFrench?: string | null
  extraMeanings?: number
}

function ListRow({
  entry,
  extraMeanings,
  matchedFrench,
}: {
  entry: WordCardEntry
  extraMeanings?: number
  matchedFrench?: string | null
}) {
  const meaningsText = extraMeanings !== undefined ? otherMeaningsLabel(extraMeanings + 1) : null

  return (
    <Link
      href={`/lexicon/${entry.id}`}
      className="flex items-center gap-4 px-4 py-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all group"
    >
      <span className="bg-secondary text-white text-xs font-semibold rounded-full px-2.5 py-0.5 shrink-0 w-16 text-center">
        {primaryLabel(entry.pos)}
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="font-heading font-bold transition-colors text-foreground group-hover:text-primary">
          {entry.bete_phonetic}
        </span>
        <span className="text-xs font-mono text-muted-foreground">[{entry.bete_word.replace(/^_pending_.*/, '')}]</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 max-w-[260px]">
        <span className="text-sm text-muted-foreground italic truncate">
          {entry.top_french}
        </span>
        {meaningsText && (
          <span className="text-xs text-muted-foreground not-italic shrink-0">
            {meaningsText}
          </span>
        )}
        {matchedFrench && matchedFrench !== entry.top_french && (
          <span className="text-xs text-muted-foreground not-italic truncate">
            (« {matchedFrench} »)
          </span>
        )}
      </div>
      {entry.validated ? (
        <span className="text-xs text-secondary font-semibold shrink-0">✓</span>
      ) : (
        <span className="text-xs text-amber-600 font-medium shrink-0">⚠</span>
      )}
    </Link>
  )
}

export default function LexiconPage() {
  const [category, setCategory] = useState('Tous')
  const [letter, setLetter] = useState('Tous')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [entries, setEntries] = useState<LexiconListEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const supabaseRef = useRef(createClient())
  const { dialect } = useDialect()

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query)
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  // Reset page to 0 when filter params change during render
  const [prevParams, setPrevParams] = useState({ category, letter, dialect, debounced })
  if (
    prevParams.category !== category ||
    prevParams.letter !== letter ||
    prevParams.dialect !== dialect ||
    prevParams.debounced !== debounced
  ) {
    setPrevParams({ category, letter, dialect, debounced })
    setPage(0)
  }

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setLoading(true)
    })
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const filter = FILTERS.find(f => f.label === category)
    const searchText = debounced.trim()

    if (searchText) {
      searchLexicon(supabaseRef.current, {
        q: searchText,
        dialect,
        pos: filter?.tag,
        limit: PAGE_SIZE,
        offset: from,
      }).then(({ rows, total: searchTotal, error }) => {
        if (cancelled) return
        if (!error) {
          setEntries(
            rows.map(r => ({
              id: r.id,
              bete_phonetic: r.bete_phonetic,
              bete_word: r.bete_word,
              top_french: r.top_french,
              pos: r.pos,
              validated: r.validated,
              matchedFrench: r.matched_french,
            }))
          )
          setTotal(searchTotal)
        }
        setLoading(false)
      })
    } else {
      let q = supabaseRef.current
        .from('lexicon')
        .select('*, lexicon_translations(count)', { count: 'exact' })
        .not('pos', 'cs', '{"fragment"}')
        .eq('dialect', dialect)
        // Untranslated placeholders (empty bete_phonetic) are not dictionary entries yet.
        .neq('bete_phonetic', '')
        .order('bete_phonetic', { ascending: true })
        .range(from, to)

      if (filter?.tag) {
        q = q.contains('pos', [filter.tag])
      }

      if (letter !== 'Tous') {
        q = q.or(`bete_phonetic.ilike.${letter}%,top_french.ilike.${letter}%`)
      }

      q.then(({ data, count, error }) => {
        if (cancelled) return
        if (!error) {
          type LexiconDbRow = WordCardEntry & { lexicon_translations?: { count: number }[] | null }
          const list = (data ?? []).map((row: LexiconDbRow) => ({
            id: row.id,
            bete_phonetic: row.bete_phonetic,
            bete_word: row.bete_word,
            top_french: row.top_french,
            pos: row.pos,
            validated: row.validated,
            extraMeanings: Math.max(0, translationCount(row.lexicon_translations) - 1),
          }))
          setEntries(list)
          setTotal(count ?? 0)
        }
        setLoading(false)
      })
    }
    return () => { cancelled = true }
  }, [category, letter, page, dialect, debounced])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Dictionnaire"
        title="Lexique Bhété"
        subtitle="Explorez les mots de la langue bhété, leur prononciation et leur traduction en français."
      />

      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <DialectSelector />
      </div>

      <div className="mb-6">
        <Input
          type="search"
          placeholder="Rechercher en bhété ou en français…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="max-w-md text-base"
        />
      </div>

      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 mb-6">
        <div className="flex flex-col gap-3 max-w-full overflow-hidden">
          <FilterPills options={FILTER_LABELS} value={category} onChange={setCategory} />
          {!debounced.trim() && (
            <FilterPills options={['Tous', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')]} value={letter} onChange={setLetter} />
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 xl:pt-1">
          <span className="text-sm text-muted-foreground">
            {loading ? '…' : `${total} mot${total !== 1 ? 's' : ''} trouvé${total !== 1 ? 's' : ''}`}
          </span>
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`w-9 h-9 flex items-center justify-center transition-colors ${viewMode === 'grid' ? 'bg-primary text-white' : 'hover:bg-muted'}`}
              aria-label="Vue grille"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`w-9 h-9 flex items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-primary text-white' : 'hover:bg-muted'}`}
              aria-label="Vue liste"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="bg-muted rounded-xl h-48 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="bg-muted rounded-lg h-14 animate-pulse" />
            ))}
          </div>
        )
      ) : entries.length === 0 ? (
        debounced.trim() ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-muted-foreground text-sm">
              Aucun mot trouvé pour « {debounced.trim()} ».
            </p>
            <Link
              href={`/contribute?word=${encodeURIComponent(debounced.trim())}&type=word`}
              className="inline-flex items-center gap-1 text-primary hover:underline font-medium text-sm"
            >
              Ajouter « {debounced.trim()} » au lexique →
            </Link>
            <Link
              href={`/usages?q=${encodeURIComponent(debounced.trim())}`}
              className="block text-primary hover:underline text-sm"
            >
              Voir des usages de « {debounced.trim()} » dans les textes →
            </Link>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm py-10 text-center">
            Aucun mot trouvé pour cette catégorie.
          </p>
        )
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {entries.map(entry => (
            <WordCard
              key={entry.id}
              entry={entry}
              extraMeanings={entry.extraMeanings}
              matchedFrench={entry.matchedFrench}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => (
            <ListRow
              key={entry.id}
              entry={entry}
              extraMeanings={entry.extraMeanings}
              matchedFrench={entry.matchedFrench}
            />
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
