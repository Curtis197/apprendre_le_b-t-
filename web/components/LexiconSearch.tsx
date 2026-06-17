'use client'
import { useState, useTransition, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { LexiconEntry } from './LexiconEntry'
import { createClient } from '@/lib/supabase-browser'
import type { LexiconEntry as TLexiconEntry } from '@/lib/types'

export function LexiconSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TLexiconEntry[]>([])
  const [isPending, startTransition] = useTransition()
  const supabaseRef = useRef(createClient())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(() => {
      const q = query.trim().toLowerCase()
      startTransition(async () => {
        const { data } = await supabaseRef.current
          .from('lexicon')
          .select('*')
          .or(`top_french.ilike.%${q}%,bete_phonetic.ilike.%${q}%,bete_word.ilike.%${q}%`)
          .order('upvotes', { ascending: false })
          .limit(20)
        setResults((data ?? []) as TLexiconEntry[])
      })
    }, 300)
  }, [query])

  return (
    <div className="space-y-4">
      <Input
        placeholder="Rechercher en français ou en bhété (phonétique)…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="text-base"
      />
      {isPending && <p className="text-sm text-muted-foreground">Recherche…</p>}
      <div className="grid gap-3">
        {results.map(entry => (
          <LexiconEntry key={entry.id} entry={entry} compact />
        ))}
        {query.trim() && !isPending && results.length === 0 && (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Aucun résultat pour « {query.trim()} »</p>
            <Link
              href={`/contribute?word=${encodeURIComponent(query.trim())}&type=word`}
              className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
            >
              Ajouter « {query.trim()} » au lexique →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
