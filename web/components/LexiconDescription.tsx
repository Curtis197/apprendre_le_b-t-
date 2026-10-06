'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase-browser'
import { updateDescription } from '@/lib/lexicon-mutations'
import { DESCRIPTION_MAX } from '@/lib/lexicon'
import { useEditMode } from '@/components/lexicon/EditMode'

export function LexiconDescription({ lexiconId, initial }: { lexiconId: string; initial: string }) {
  const router = useRouter()
  const editMode = useEditMode()
  const supabaseRef = useRef(createClient())
  const [signedIn, setSignedIn] = useState(false)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabaseRef.current.auth.getUser().then(({ data }) => setSignedIn(!!data.user))
  }, [])

  const [prevInitial, setPrevInitial] = useState(initial)
  if (prevInitial !== initial) {
    setPrevInitial(initial)
    setText(initial)
  }

  async function save() {
    setBusy(true)
    setError(null)
    const res = await updateDescription(supabaseRef.current, lexiconId, text)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    setEditing(false)
    router.refresh()
  }

  if (!editing && !initial && !(editMode && signedIn)) return null

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg font-heading">Description</h2>
        {editMode && signedIn && !editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {initial ? 'Modifier' : 'Ajouter une description'}
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={text}
            rows={4}
            maxLength={DESCRIPTION_MAX}
            onChange={e => setText(e.target.value)}
            placeholder="Explication, usage, nuances…"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}>{busy ? 'Envoi…' : 'Enregistrer'}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { setEditing(false); setText(initial); setError(null) }}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-line">{initial}</p>
      )}
    </section>
  )
}
