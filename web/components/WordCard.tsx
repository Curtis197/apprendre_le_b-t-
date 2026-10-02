'use client'
import Link from 'next/link'
import { cn, cleanBeteWord } from '@/lib/utils'
import type { LexiconEntry } from '@/lib/types'
import { otherMeaningsLabel } from '@/lib/lexicon'

export type WordCardEntry = Pick<
  LexiconEntry,
  'id' | 'bete_phonetic' | 'bete_word' | 'top_french' | 'pos' | 'validated'
>

interface Props {
  entry: WordCardEntry
  extraMeanings?: number
  matchedFrench?: string | null
  className?: string
}

const TAG_LABELS: Record<string, string> = {
  noun: 'Nom', verb: 'Verbe', adj: 'Adj.', adv: 'Adv.',
  name: 'Nom propre', num: 'Num.', interj: 'Interj.',
  prep: 'Prép.', conj: 'Conj.', pron: 'Pron.',
  family: 'Famille', nature: 'Nature', body: 'Corps',
  religion: 'Religion', animal: 'Animal', food: 'Alimentation',
  place: 'Lieu', time: 'Temps', action: 'Action',
}

function primaryLabel(pos: string[] | null): string {
  if (!pos?.length) return 'Mot'
  return TAG_LABELS[pos[0]] ?? pos[0]
}

function semanticTags(pos: string[] | null): string[] {
  const semantic = ['family', 'nature', 'body', 'religion', 'animal', 'food', 'place', 'time', 'action']
  return (pos ?? []).filter(t => semantic.includes(t))
}

export function WordCard({ entry, extraMeanings, matchedFrench, className }: Props) {
  const meaningsText = extraMeanings !== undefined ? otherMeaningsLabel(extraMeanings + 1) : null

  return (
    <Link href={`/lexicon/${entry.id}`} className={cn(
      'bg-card rounded-xl p-6 border-2 border-transparent hover:border-primary hover:shadow-lg transition-all group block',
      className
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex flex-wrap gap-1">
          <span className="bg-secondary text-white text-xs font-semibold rounded-full px-3 py-1">
            {primaryLabel(entry.pos)}
          </span>
          {semanticTags(entry.pos).map(t => (
            <span key={t} className="bg-muted text-muted-foreground text-xs rounded-full px-2 py-1">
              {TAG_LABELS[t] ?? t}
            </span>
          ))}
        </div>
      </div>
      <h3 className="font-heading text-2xl font-bold mb-2 text-foreground">
        {entry.bete_phonetic}
      </h3>
      <div
        className="w-16 h-1 mb-2 rounded-full"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, var(--color-primary) 0, var(--color-primary) 4px, transparent 4px, transparent 10px)',
          opacity: 0.25,
        }}
      />
      <div className="mb-3">
        <p className="italic text-muted-foreground text-sm flex items-center gap-2 flex-wrap">
          <span>{entry.top_french}</span>
          {meaningsText && (
            <span className="text-xs text-muted-foreground not-italic font-normal">
              {meaningsText}
            </span>
          )}
        </p>
        {matchedFrench && matchedFrench !== entry.top_french && (
          <p className="text-xs text-muted-foreground">correspond à « {matchedFrench} »</p>
        )}
      </div>
      <div className="border-t border-border pt-3 flex items-center justify-between opacity-60 group-hover:opacity-100 transition-opacity">
        <span className="text-xs text-muted-foreground font-mono">
          [{cleanBeteWord(entry.bete_word)}]
        </span>
        {entry.validated
          ? <span className="text-xs text-secondary font-semibold">✓ validé</span>
          : <span className="text-xs text-amber-600 font-medium">⚠ non validé</span>
        }
      </div>
    </Link>
  )
}
