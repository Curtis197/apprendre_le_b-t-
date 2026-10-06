'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useEditMode } from '@/components/lexicon/EditMode'

export interface SpellingItem {
  id: string
  spelling: string
  created_by: string | null
}

interface Props {
  items: SpellingItem[]
  /** null: signed out (reading only). */
  userId: string | null
  isAdmin: boolean
  busy: boolean
  error: string
  notice: string
  /** Where a signed-out visitor goes to sign in (and come back here). */
  signInHref: string
  onAdd: (spelling: string) => void
  onRemove: (id: string) => void
}

const btn = 'rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50'

/** « Autres graphies » of an entry: the list, and for signed-in users a field to propose one. */
export function SpellingsList({ items, userId, isAdmin, busy, error, notice, signInHref, onAdd, onRemove }: Props) {
  const editMode = useEditMode()
  const [value, setValue] = useState('')

  // A reader just reading has nothing to see when no other spelling was proposed.
  if (!editMode && items.length === 0) return null

  return (
    <section id="graphies" className="space-y-3">
      <h2 className="font-semibold text-lg font-heading">Autres graphies</h2>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune autre graphie proposée pour ce mot.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map(s => {
            const canRemove = editMode && (isAdmin || (userId !== null && s.created_by === userId))
            return (
              <li key={s.id} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm">
                <span className="font-medium">{s.spelling}</span>
                {canRemove && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                    disabled={busy}
                    onClick={() => onRemove(s.id)}
                  >
                    Retirer
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!editMode ? null : userId ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={e => {
            e.preventDefault()
            const spelling = value.trim()
            if (!spelling) return
            onAdd(spelling)
            setValue('')
          }}
        >
          <input
            className="min-w-[12rem] flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
            placeholder="Proposer une autre graphie"
            aria-label="Proposer une autre graphie"
            value={value}
            maxLength={100}
            onChange={e => setValue(e.target.value)}
          />
          <button type="submit" className={`${btn} bg-primary text-primary-foreground`} disabled={busy || value.trim() === ''}>
            Ajouter
          </button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">
          <Link href={signInHref} className="text-primary underline underline-offset-2">
            Connectez-vous
          </Link>{' '}
          pour proposer une autre graphie.
        </p>
      )}

      {notice && <p className="text-xs text-primary" role="status">{notice}</p>}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </section>
  )
}
