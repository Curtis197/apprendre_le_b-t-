'use client'
import { useEffect, useMemo, useState } from 'react'
import { FrenchMatchesList } from '@/components/FrenchMatchesList'
import { shouldSearchFrench } from '@/lib/contribution'
import { addSpelling, findByFrench, type FrenchMatch } from '@/lib/lexicon-links-data'
import { createClient } from '@/lib/supabase-browser'
import type { LexSummary } from '@/lib/word-blocks'

const DEBOUNCE_MS = 400
const SHOWN = 3

/**
 * Under a French sense field of the word form: looks for entries of the same dialect that already have
 * this meaning, so the contributor can add their spelling to one of them instead of duplicating it.
 */
export function FrenchMatches({ text, dialect, spelling }: { text: string; dialect: string; spelling: string }) {
  const client = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  // Results belong to the text they were searched for: while the next search is pending nothing stale is shown.
  const [found, setFound] = useState<{ forText: string; rows: FrenchMatch[] }>({ forText: '', rows: [] })
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  // Confirmation and error belong to the spelling they were produced for: typing again clears them.
  const [addedFor, setAddedFor] = useState<{ spelling: string; entry: LexSummary } | null>(null)
  const [errorFor, setErrorFor] = useState<{ spelling: string; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const typedFrench = text.trim()
  const typedSpelling = spelling.trim()

  useEffect(() => {
    client.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [client])

  useEffect(() => {
    if (!shouldSearchFrench(text)) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const rows = await findByFrench(client, { text, dialect, kind: 'word', limit: SHOWN + 1 })
      if (!cancelled) setFound({ forText: text, rows: rows.slice(0, SHOWN) })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [client, text, dialect])

  async function onAdd(m: FrenchMatch) {
    setBusy(true)
    setErrorFor(null)
    const res = await addSpelling(client, m.entry.id, spelling)
    setBusy(false)
    if (res.error) {
      setErrorFor({ spelling: typedSpelling, message: res.error })
      return
    }
    setAddedFor({ spelling: typedSpelling, entry: m.entry })
  }

  if (dismissedFor === typedFrench) return null
  return (
    <FrenchMatchesList
      matches={shouldSearchFrench(text) && found.forText === text ? found.rows : []}
      typed={spelling}
      userId={userId}
      busy={busy}
      added={addedFor?.spelling === typedSpelling ? addedFor : null}
      error={errorFor?.spelling === typedSpelling ? errorFor.message : ''}
      onAdd={onAdd}
      onDismiss={() => setDismissedFor(typedFrench)}
    />
  )
}
