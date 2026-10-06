'use client'
import Link from 'next/link'
import type { FrenchMatch } from '@/lib/lexicon-links-data'
import type { LexSummary } from '@/lib/word-blocks'

interface Props {
  matches: FrenchMatch[]
  /** What the contributor typed in the spelling field: the spelling that would be added to an existing entry. */
  typed: string
  /** null: signed out. */
  userId: string | null
  busy: boolean
  /** Set once a spelling was added: replaces the list with a confirmation. */
  added: { spelling: string; entry: LexSummary } | null
  error: string
  onAdd: (m: FrenchMatch) => void
  onDismiss: () => void
}

const btn = 'rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50'

const sameSpelling = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** « Ce sens existe déjà » under a French sense field of the word form. */
export function FrenchMatchesList({ matches, typed, userId, busy, added, error, onAdd, onDismiss }: Props) {
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
  if (matches.length === 0) return null

  return (
    <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-50/50 p-3 text-sm dark:bg-amber-950/20">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ce sens existe déjà</p>
      <ul className="space-y-2">
        {matches.map(m => (
          <li key={m.entry.id} className="space-y-1">
            <p>
              <span className="font-semibold">{m.entry.spelling}</span>
              <span className="text-muted-foreground">
                {' '}: {m.matched}
                {m.context ? ` (${m.context})` : ''}
              </span>
            </p>
            {sameSpelling(m.entry.spelling, typed) ? (
              <p className="text-xs">
                <Link href={`/lexicon/${m.entry.id}`} className="text-primary underline underline-offset-2">
                  Ouvrir la fiche
                </Link>
              </p>
            ) : userId ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={`${btn} bg-primary text-primary-foreground`}
                  disabled={busy || typed.trim() === ''}
                  onClick={() => onAdd(m)}
                >
                  C’est le même mot : ajouter ma graphie « {typed.trim()} »
                </button>
                <Link href={`/lexicon/${m.entry.id}`} className="text-xs text-primary underline underline-offset-2">
                  Ouvrir la fiche
                </Link>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Connectez-vous pour ajouter votre graphie à cette fiche.{' '}
                <Link href={`/lexicon/${m.entry.id}`} className="text-primary underline underline-offset-2">
                  Ouvrir la fiche
                </Link>
              </p>
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
