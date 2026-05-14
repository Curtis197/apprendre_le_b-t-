'use client'
import { Volume2, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LexiconEntry } from '@/lib/types'

interface Props {
  entry: LexiconEntry
  featured?: boolean
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

function speak(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  speechSynthesis.cancel()
  speechSynthesis.speak(new SpeechSynthesisUtterance(text))
}

export function WordCard({ entry, featured = false, className }: Props) {
  if (featured) {
    return (
      <div className={cn('bg-primary/10 border border-primary/20 rounded-xl p-6 relative overflow-hidden', className)}>
        <div className="flex items-start justify-between mb-4">
          <span className="bg-secondary/20 text-secondary text-xs font-semibold rounded-full px-3 py-1">
            Mot du Jour
          </span>
          <button
            aria-label="Écouter la prononciation"
            onClick={() => speak(entry.bete_phonetic)}
            className="w-14 h-14 bg-primary/20 hover:bg-primary hover:text-white text-primary rounded-full flex items-center justify-center transition-colors"
          >
            <Volume2 className="w-6 h-6" />
          </button>
        </div>
        <h2 className="font-heading text-4xl font-bold text-primary mb-1">{entry.bete_word}</h2>
        <p className="text-sm italic text-muted-foreground mb-3">[{entry.bete_phonetic}]</p>
        <div className="w-16 h-0.5 bg-primary/30 mb-3" />
        <p className="italic text-foreground/80">{entry.top_french}</p>
        <BookOpen className="absolute -bottom-4 -right-4 w-32 h-32 text-primary opacity-10" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className={cn(
      'bg-card rounded-xl p-6 border-2 border-transparent hover:border-primary hover:shadow-lg transition-all group',
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
        <button
          aria-label="Écouter la prononciation"
          onClick={() => speak(entry.bete_phonetic)}
          className="w-12 h-12 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded-full flex items-center justify-center transition-colors group-hover:scale-110"
        >
          <Volume2 className="w-5 h-5" />
        </button>
      </div>
      <h3 className="font-heading text-2xl font-bold text-foreground mb-2">{entry.bete_word}</h3>
      <div
        className="w-16 h-1 mb-2 rounded-full"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, var(--color-primary) 0, var(--color-primary) 4px, transparent 4px, transparent 10px)',
          opacity: 0.25,
        }}
      />
      <p className="italic text-muted-foreground text-sm mb-3">{entry.top_french}</p>
      <div className="border-t border-border pt-3 flex items-center justify-between opacity-60 group-hover:opacity-100 transition-opacity">
        <span className="text-xs text-muted-foreground font-mono">[{entry.bete_phonetic}]</span>
        {entry.validated && (
          <span className="text-xs text-secondary font-semibold">✓ validé</span>
        )}
      </div>
    </div>
  )
}
