'use client'
import { useEffect, useMemo, useState } from 'react'
import { SimilarWordsList } from '@/components/SimilarWordsList'
import { shouldSearchSimilar } from '@/lib/contribution'
import type { DialectKey } from '@/lib/dialect'
import type { Candidate } from '@/lib/lexicon-links'
import { addSpelling, findCandidates } from '@/lib/lexicon-links-data'
import { createClient } from '@/lib/supabase-browser'
import type { LexSummary } from '@/lib/word-blocks'

const DEBOUNCE_MS = 400
const SHOWN = 3

/**
 * Under the spelling field of the word form: looks for lexicon entries of the same dialect that
 * look like what is being typed, so a variant spelling is added to the entry instead of duplicating it.
 */
export function SimilarWords({ text, dialect }: { text: string; dialect: DialectKey }) {
  const client = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  // Results belong to the text they were searched for: while the next search is pending nothing stale is shown.
  const [found, setFound] = useState<{ forText: string; rows: Candidate[] }>({ forText: '', rows: [] })
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  // Confirmation and error belong to the spelling they were produced for: typing again clears them.
  const [addedFor, setAddedFor] = useState<{ spelling: string; entry: LexSummary } | null>(null)
  const [errorFor, setErrorFor] = useState<{ spelling: string; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const typed = text.trim()

  useEffect(() => {
    client.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [client])

  useEffect(() => {
    if (!shouldSearchSimilar(text)) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const rows = await findCandidates(client, { text, dialect, kind: 'word', limit: 8 })
      if (!cancelled) setFound({ forText: text, rows: rows.filter(c => c.entry.dialect === dialect).slice(0, SHOWN) })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [client, text, dialect])

  async function onAdd(c: Candidate) {
    setBusy(true)
    setErrorFor(null)
    const res = await addSpelling(client, c.entry.id, text)
    setBusy(false)
    if (res.error) {
      setErrorFor({ spelling: typed, message: res.error })
      return
    }
    setAddedFor({ spelling: typed, entry: c.entry })
  }

  if (dismissedFor === typed) return null
  return (
    <SimilarWordsList
      candidates={shouldSearchSimilar(text) && found.forText === text ? found.rows : []}
      typed={text}
      userId={userId}
      busy={busy}
      added={addedFor?.spelling === typed ? addedFor : null}
      error={errorFor?.spelling === typed ? errorFor.message : ''}
      onAdd={onAdd}
      onDismiss={() => setDismissedFor(typed)}
    />
  )
}
