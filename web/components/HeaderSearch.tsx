'use client'
import { useState, useEffect, useRef, useTransition } from 'react'
import { Search, X } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import type { LexiconEntry } from '@/lib/types'

export function HeaderSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LexiconEntry[]>([])
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
    if (!query.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(() => {
      const q = query.trim().toLowerCase()
      startTransition(async () => {
        const { data } = await supabaseRef.current
          .from('lexicon')
          .select('id,bete_word,bete_phonetic,top_french,pos,validated,upvotes,probability,french_candidates,notes')
          .or(`top_french.ilike.%${q}%,bete_phonetic.ilike.%${q}%,bete_word.ilike.%${q}%`)
          .order('upvotes', { ascending: false })
          .limit(6)
        setResults((data ?? []) as LexiconEntry[])
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
              placeholder="Rechercher en français ou bété…"
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
            {results.map(entry => (
              <Link
                key={entry.id}
                href={`/lexicon/${entry.id}`}
                onClick={() => { setOpen(false); setQuery('') }}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors border-b border-border/50 last:border-0"
              >
                <div>
                  <p className="text-sm font-semibold">{entry.bete_word}</p>
                  <p className="text-xs text-muted-foreground font-mono">[{entry.bete_phonetic}]</p>
                </div>
                <p className="text-xs text-muted-foreground max-w-[120px] text-right truncate">{entry.top_french}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
