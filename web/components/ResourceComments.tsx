'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import {
  createResourceComment,
  deleteResourceComment,
  updateResourceComment,
} from '@/lib/community-mutations'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { ResourceComment } from '@/lib/types'

interface Props {
  resourceId: string
  comments: ResourceComment[]
  /** Null when nobody is signed in. */
  currentUserId: string | null
  isAdmin: boolean
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

export function ResourceComments({ resourceId, comments, currentUserId, isAdmin }: Props) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Runs a mutation, then refreshes the server-rendered list. */
  async function run(action: () => Promise<{ error: string | null }>, onDone?: () => void) {
    setBusy(true)
    setError(null)
    const { error: err } = await action()
    setBusy(false)
    if (err) { setError(err); return }
    onDone?.()
    router.refresh()
  }

  return (
    <section aria-labelledby="comments-title" className="space-y-4">
      <h2 id="comments-title" className="font-heading font-semibold text-lg flex items-center gap-2">
        <MessageSquare className="w-4 h-4" />
        Commentaires{comments.length > 0 ? ` (${comments.length})` : ''}
      </h2>

      {comments.length > 0 && (
        <ul className="space-y-3">
          {comments.map(c => {
            const isMine = currentUserId !== null && c.user_id === currentUserId
            const canDelete = isMine || isAdmin
            const edited = new Date(c.updated_at).getTime() - new Date(c.created_at).getTime() > 1000
            return (
              <li key={c.id} className="rounded-xl border border-border bg-card px-4 py-3 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{c.author_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(c.created_at)}{edited ? ' · modifié' : ''}
                  </span>
                </div>

                {editingId === c.id ? (
                  <div className="space-y-2">
                    <Textarea
                      aria-label="Modifier le commentaire"
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={3}
                      maxLength={2000}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy || !editText.trim()}
                        onClick={() => run(() => updateResourceComment(supabaseRef.current, c.id, editText), () => setEditingId(null))}
                      >
                        Enregistrer
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditingId(null)}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{c.body}</p>
                )}

                {editingId !== c.id && (isMine || canDelete) && (
                  <div className="flex gap-3 pt-0.5 text-xs">
                    {isMine && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => { setEditingId(c.id); setEditText(c.body) }}
                      >
                        Modifier
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        disabled={busy}
                        className="text-destructive/80 hover:text-destructive transition-colors disabled:opacity-50"
                        onClick={() => {
                          if (!window.confirm('Supprimer ce commentaire ?')) return
                          run(() => deleteResourceComment(supabaseRef.current, c.id))
                        }}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {currentUserId ? (
        <div className="space-y-2">
          <Textarea
            aria-label="Votre commentaire"
            placeholder="Proposer une correction, une précision, une variante…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            maxLength={2000}
          />
          <Button
            disabled={busy || !draft.trim()}
            onClick={() => run(() => createResourceComment(supabaseRef.current, resourceId, draft), () => setDraft(''))}
          >
            Commenter
          </Button>
        </div>
      ) : (
        <Link
          href={`/auth?next=/resources/${resourceId}`}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-white text-sm font-semibold px-4 h-9 hover:bg-primary/90 transition-colors"
        >
          Se connecter pour commenter
        </Link>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  )
}
