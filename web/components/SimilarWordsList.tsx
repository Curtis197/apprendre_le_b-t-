'use client'
import Link from 'next/link'
import { similarKind } from '@/lib/contribution'
import type { Candidate } from '@/lib/lexicon-links'
import type { LexSummary } from '@/lib/word-blocks'

interface Props {
  candidates: Candidate[]
  /** What the contributor typed: the spelling that would be added to an existing entry. */
  typed: string
  /** null: signed out. */
  userId: string | null
  busy: boolean
  /** Set once a spelling was added: replaces the list with a confirmation. */
  added: { spelling: string; entry: LexSummary } | null
  error: string
  onAdd: (c: Candidate) => void
  onDismiss: () => void
}

const btn = 'rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50'

const meaningOf = (e: LexSummary): string =>
  e.senses.slice(0, 2).map(s => s.french).join(', ')

/** « Ce mot existe peut-être déjà » under the spelling field of the word form. */
export function SimilarWordsList({ candidates, typed, userId, busy, added, error, onAdd, onDismiss }: Props) {
  if (added) {
    return (
      <p className="text-sm text-primary" role="status">
        Graphie « {added.spelling} » ajoutée à la fiche de{' '}
        <Link href={`/lexicon/${added.entry.id}`} className="font-semibold underline underline-offset-2">
          {added.entry.spelling}
        </Link>
        .
      </p>
    )
  }
  if (candidates.length === 0) return null

  return (
    <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-50/50 p-3 text-sm dark:bg-amber-950/20">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ce mot existe peut-être déjà</p>
      <ul className="space-y-2">
        {candidates.map(c => (
          <li key={c.entry.id} className="space-y-1">
            <p>
              <span className="font-semibold">{c.entry.spelling}</span>
              {meaningOf(c.entry) && <span className="text-muted-foreground"> : {meaningOf(c.entry)}</span>}
            </p>
            {similarKind(c) === 'same' ? (
              <p className="text-xs">
                Ce mot existe déjà :{' '}
                <Link href={`/lexicon/${c.entry.id}`} className="text-primary underline underline-offset-2">
                  ouvrir la fiche
                </Link>
                .
              </p>
            ) : userId ? (
              <button type="button" className={`${btn} bg-primary text-primary-foreground`} disabled={busy} onClick={() => onAdd(c)}>
                C’est le même mot : ajouter ma graphie « {typed.trim()} »
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">Connectez-vous pour ajouter votre graphie à cette fiche.</p>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      <button type="button" className={btn} onClick={onDismiss}>
        Mot différent : continuer
      </button>
    </div>
  )
}
