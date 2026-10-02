'use client'
import { useState, useEffect, useRef, useTransition } from 'react'
import { Search, X } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { searchLexicon, type LexiconSearchRow } from '@/lib/lexicon-search'
import { cleanBeteForm } from '@/lib/lexicon'

export function HeaderSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LexiconSearchRow[]>([])
  const [isPending, startTransition] = useTransition()
  const supabaseRef = useRef(createClient())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      debounceRef.current = setTimeout(() => setResults([]), 0)
      return
    }
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const { rows } = await searchLexicon(supabaseRef.current, { q: query, limit: 6 })
        setResults(rows)
      })
    }, 250)
  }, [query])

  return (
    <div ref={containerRef} className="relative hidden md:block">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-muted rounded-full px-4 py-2 text-sm text-muted-foreground hover:bg-muted/80 transition-colors"
      >
        <Search className="w-4 h-4 shrink-0" />
        <span>Rechercher…</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-background border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher en français ou bhété…"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {isPending && (
              <p className="text-xs text-muted-foreground px-4 py-3">Recherche…</p>
            )}
            {!isPending && query.trim() && results.length === 0 && (
              <p className="text-xs text-muted-foreground px-4 py-3">
                Aucun résultat pour « {query.trim()} »
              </p>
            )}
            {results.map(entry => {
              const western = entry.bete_phonetic
              const ipa = cleanBeteForm(entry.bete_word)
              const showIpa = ipa && ipa !== western
              const rightFrench = entry.matched_french ?? entry.top_french

              return (
                <Link
                  key={entry.id}
                  href={`/lexicon/${entry.id}`}
                  onClick={() => { setOpen(false); setQuery('') }}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors border-b border-border/50 last:border-0"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-sm font-semibold truncate">{western}</p>
                    {showIpa && (
                      <p className="text-xs text-muted-foreground font-mono">[{ipa}]</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground max-w-[120px] text-right truncate shrink-0">
                    {rightFrench}
                  </p>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
