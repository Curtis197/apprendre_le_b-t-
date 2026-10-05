'use client'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SpellingsList, type SpellingItem } from '@/components/lexicon/SpellingsList'
import { addSpelling, removeSpelling } from '@/lib/lexicon-links-data'
import { createClient } from '@/lib/supabase-browser'

/** « Autres graphies » on the entry page: the spellings come from the server, writes refresh the page. */
export function SpellingsSection({ lexiconId, items }: { lexiconId: string; items: SpellingItem[] }) {
  const client = useMemo(() => createClient(), [])
  const router = useRouter()
  const pathname = usePathname()
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    client.auth.getUser().then(async ({ data }) => {
      if (cancelled) return
      setUserId(data.user?.id ?? null)
      if (data.user) {
        const res = await client.rpc('is_admin')
        if (!cancelled) setIsAdmin(res.data === true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [client])

  async function run(action: () => Promise<{ error: string | null }>, done: string) {
    setBusy(true)
    setError('')
    setNotice('')
    const res = await action()
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setNotice(done)
    router.refresh()
  }

  return (
    <SpellingsList
      items={items}
      userId={userId}
      isAdmin={isAdmin}
      busy={busy}
      error={error}
      notice={notice}
      signInHref={`/auth?next=${encodeURIComponent(pathname)}`}
      onAdd={spelling => run(() => addSpelling(client, lexiconId, spelling), 'Graphie ajoutée, merci !')}
      onRemove={id => run(() => removeSpelling(client, id), 'Graphie retirée.')}
    />
  )
}
