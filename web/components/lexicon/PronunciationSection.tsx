'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PronunciationRecorder } from '@/components/courses/PronunciationRecorder'
import { PronunciationList } from '@/components/lexicon/PronunciationList'
import { useEditMode } from '@/components/lexicon/EditMode'
import { createClient } from '@/lib/supabase-browser'
import { MAX_AUDIO_PER_USER, MAX_LEXICON_AUDIO_SECONDS } from '@/lib/lexicon-audio'
import {
  deletePronunciation, listPronunciations, reportPronunciation, uploadPronunciation,
  type PronunciationRow,
} from '@/lib/lexicon-audio-data'

/** « Prononciation » of an entry: listen, record (signed in), delete (author or admin), report. */
export function PronunciationSection({ lexiconId }: { lexiconId: string }) {
  const editMode = useEditMode()
  const client = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const [items, setItems] = useState<PronunciationRow[] | null>(null)
  // undefined until the session is known: nothing is offered before that
  const [userId, setUserId] = useState<string | null | undefined>(undefined)
  const [isAdmin, setIsAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => setItems(await listPronunciations(client, lexiconId)), [client, lexiconId])

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
    load()
    return () => {
      cancelled = true
    }
  }, [client, load])

  const mine = userId ? (items ?? []).filter(i => i.createdBy === userId).length : 0

  async function run(action: () => Promise<{ error: string | null }>, done = '') {
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
    await load()
  }

  // A reader just reading has nothing to see until a pronunciation exists.
  if (!editMode && items !== null && items.length === 0) return null

  return (
    <section id="prononciation" className="space-y-3">
      <h2 className="font-semibold text-lg font-heading">Prononciation</h2>
      {items === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <PronunciationList
          items={items}
          userId={userId ?? null}
          isAdmin={isAdmin}
          busy={busy}
          error={error}
          notice={notice}
          onDelete={id => run(() => deletePronunciation(client, id))}
          onReport={(id, message) => run(() => reportPronunciation(client, id, message), 'Signalement envoyé, merci.')}
        />
      )}

      {editMode && userId === null && (
        <p className="text-xs text-muted-foreground">
          <Link href={`/auth?next=${encodeURIComponent(pathname)}`} className="text-primary underline underline-offset-2">
            Connectez-vous
          </Link>{' '}
          pour enregistrer la prononciation de ce mot.
        </p>
      )}
      {editMode && userId && mine >= MAX_AUDIO_PER_USER && (
        <p className="text-xs text-muted-foreground">
          Vous avez déjà {MAX_AUDIO_PER_USER} enregistrements pour ce mot : supprimez-en un pour en ajouter.
        </p>
      )}
      {editMode && userId && mine < MAX_AUDIO_PER_USER && (
        <PronunciationRecorder
          key={items?.length ?? 0}
          maxSeconds={MAX_LEXICON_AUDIO_SECONDS}
          startLabel="Enregistrer la prononciation"
          sendLabel="Publier"
          sendingLabel="Publication…"
          sending={busy}
          onSend={blob => run(() => uploadPronunciation(client, { userId, lexiconId, blob }), 'Enregistrement publié, merci !')}
        />
      )}
    </section>
  )
}
