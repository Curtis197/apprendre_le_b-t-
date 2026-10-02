'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase-browser'
import { addTranslation, deleteTranslation, updateTranslation } from '@/lib/lexicon-mutations'
import { TRANSLATION_CONTEXT_MAX, TRANSLATION_FRENCH_MAX } from '@/lib/lexicon'
import type { LexiconTranslation } from '@/lib/types'
import { CorrectionBox } from '@/components/CorrectionBox'

interface Props {
  lexiconId: string
  translations: LexiconTranslation[]   // already sorted, primary first
}

export function LexiconTranslations({ lexiconId, translations }: Props) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const [userId, setUserId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [french, setFrench] = useState('')
  const [context, setContext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabaseRef.current.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  function startEdit(t: LexiconTranslation) {
    setEditingId(t.id)
    setFrench(t.french)
    setContext(t.context ?? '')
    setError(null)
  }

  function reset() {
    setEditingId(null)
    setFrench('')
    setContext('')
    setError(null)
  }

  async function save() {
    setBusy(true)
    setError(null)
    const input = { french, context }
    const res = editingId
      ? await updateTranslation(supabaseRef.current, editingId, input)
      : await addTranslation(supabaseRef.current, lexiconId, input)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    reset()
    router.refresh()
  }

  async function remove(id: string) {
    if (!window.confirm('Supprimer cette traduction ?')) return
    setBusy(true)
    const res = await deleteTranslation(supabaseRef.current, id)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    router.refresh()
  }

  const form = (
    <div className="space-y-2">
      <Input
        placeholder="Traduction française *"
        value={french}
        maxLength={TRANSLATION_FRENCH_MAX}
        onChange={e => setFrench(e.target.value)}
      />
      <Input
        placeholder="Contexte (optionnel) — ex : en parlant d’un bateau"
        value={context}
        maxLength={TRANSLATION_CONTEXT_MAX}
        onChange={e => setContext(e.target.value)}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy || !french.trim()}>
          {busy ? 'Envoi…' : editingId ? 'Enregistrer' : 'Ajouter'}
        </Button>
        {editingId && (
          <Button size="sm" variant="outline" onClick={reset} disabled={busy}>Annuler</Button>
        )}
      </div>
    </div>
  )

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-lg font-heading">
        {translations.length > 1 ? 'Traductions' : 'Traduction'}
      </h2>
      <ul className="space-y-2">
        {translations.map((t, i) => (
          <li key={t.id} className="rounded-lg border border-border px-4 py-3">
            {editingId === t.id ? form : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={i === 0 ? 'font-semibold text-lg' : 'font-medium'}>{t.french}</p>
                  {t.context && <p className="text-sm text-muted-foreground italic">{t.context}</p>}
                  {t.author_name && (
                    <p className="text-xs text-muted-foreground mt-1">ajouté par {t.author_name}</p>
                  )}
                  <div className="mt-2">
                    <CorrectionBox
                      targetType="translation"
                      targetId={t.id}
                      ownerId={t.created_by}
                      fields={[
                        { field: 'french', current: t.french },
                        { field: 'context', current: t.context },
                      ]}
                    />
                  </div>
                </div>
                {userId && t.created_by === userId && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(t)} aria-label="Modifier cette traduction">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(t.id)} disabled={busy} aria-label="Supprimer cette traduction">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {!editingId && (
        userId ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Ajouter une traduction</p>
            {form}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link href="/auth" className="text-primary hover:underline">Connectez-vous</Link> pour ajouter une traduction.
          </p>
        )
      )}
    </section>
  )
}
