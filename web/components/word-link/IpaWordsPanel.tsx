'use client'
import { cn } from '@/lib/utils'
import { autoLinkIpa, derive, ipaChips, ipaStatus, toggleIpaWord, type VerseDraft } from '@/lib/word-link-editor'

const btn = 'rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors'

interface Props {
  draft: VerseDraft
  /** The selected block (its Latin words' key). */
  blockKey: string
  onChange: (d: VerseDraft) => void
}

/** « Mots en API » of the selected block: tap an IPA word of the verse to link it to this block, or to unlink it. */
export function IpaWordsPanel({ draft, blockKey, onChange }: Props) {
  if (!draft.ipa) return null
  const chips = ipaChips(draft, blockKey)
  const status = ipaStatus(draft)
  const sameCount = status.words === derive(draft).bw.length

  return (
    <div className="space-y-2 rounded-md border border-border p-2.5">
      <p className="text-xs font-semibold">Mots en API</p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(c => (
          <button
            key={c.i}
            type="button"
            aria-pressed={c.state === 'mine'}
            title={c.state === 'other' ? `Relié à « ${c.ownerWords} » : toucher pour le déplacer ici` : undefined}
            onClick={() => onChange(toggleIpaWord(draft, blockKey, c.i))}
            className={cn(
              'phonetic rounded-md border px-2 py-1 text-sm',
              c.state === 'mine' && 'border-primary bg-primary text-primary-foreground',
              c.state === 'other' && 'border-border bg-muted text-muted-foreground',
              c.state === 'free' && 'border-border bg-background',
            )}
          >
            {c.word}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {status.linked} mots sur {status.words} reliés{status.unlinked > 0 ? ` (${status.unlinked} non relié${status.unlinked > 1 ? 's' : ''}, absents de la vue mot par mot)` : ''}.
      </p>
      {sameCount && (
        <button type="button" className={btn} onClick={() => onChange(autoLinkIpa(draft))}>
          Relier par position
        </button>
      )}
    </div>
  )
}
