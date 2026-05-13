'use client'
import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { LexiconEntry } from './LexiconEntry'
import { createClient } from '@/lib/supabase-browser'
import type { LexiconEntry as TLexiconEntry } from '@/lib/types'

export function LexiconSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TLexiconEntry[]>([])
  const [isPending, startTransition] = useTransition()
  const supabase = createClient()

  function handleSearch(value: string) {
    setQuery(value)
    if (!value.trim()) { setResults([]); return }
    startTransition(async () => {
      const q = value.trim().toLowerCase()
      const { data } = await supabase
        .from('lexicon')
        .select('*')
        .or(`top_french.ilike.%${q}%,bete_phonetic.ilike.%${q}%,bete_word.ilike.%${q}%`)
        .order('upvotes', { ascending: false })
        .limit(20)
      setResults((data ?? []) as TLexiconEntry[])
    })
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Rechercher en français ou en bété (phonétique)…"
        value={query}
        onChange={e => handleSearch(e.target.value)}
        className="text-base"
      />
      {isPending && <p className="text-sm text-muted-foreground">Recherche…</p>}
      <div className="grid gap-3">
        {results.map(entry => (
          <LexiconEntry key={entry.id} entry={entry} compact />
        ))}
        {query && !isPending && results.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun résultat pour « {query} »</p>
        )}
      </div>
    </div>
  )
}
