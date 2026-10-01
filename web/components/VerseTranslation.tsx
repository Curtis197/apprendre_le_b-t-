'use client'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { alignVerses, type Verse } from '@/lib/verses'
import { InterlinearGloss } from './InterlinearGloss'

interface Props {
  original: string
  literal?: string | null
  french?: string | null
  /** The mot à mot is optional to write and optional to read: hidden unless asked for. */
  defaultShowLiteral?: boolean
}

function Lines({ children, className }: { children: string; className?: string }) {
  return <p className={cn('whitespace-pre-wrap', className)}>{children}</p>
}

function VerseRow({ verse, showLiteral }: { verse: Verse; showLiteral: boolean }) {
  return (
    <div className="space-y-0.5">
      <Lines className="font-semibold text-foreground leading-relaxed">{verse.original}</Lines>
      {showLiteral && verse.literal && (
        <Lines className="text-xs md:text-sm italic text-primary/80 leading-relaxed">{`« ${verse.literal} »`}</Lines>
      )}
      {verse.french && (
        <Lines className="text-sm md:text-base text-muted-foreground leading-relaxed">{verse.french}</Lines>
      )}
    </div>
  )
}

/**
 * A long text shown verse by verse: each line of the Bhété text sits right above its own
 * translation, so the reader never has to jump between three separate blocks. Text that
 * is short, or whose fields don't line up, keeps the plain three-tier card.
 */
export function VerseTranslation({ original, literal, french, defaultShowLiteral = false }: Props) {
  const alignment = useMemo(() => alignVerses(original, literal, french), [original, literal, french])
  const hasLiteral = Boolean(literal?.trim())
  const [showLiteral, setShowLiteral] = useState(defaultShowLiteral)

  if (alignment.kind === 'single' || alignment.kind === 'misaligned') {
    return <InterlinearGloss original={original} literal={literal} final={french} variant="card" />
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {alignment.kind === 'verses'
            ? alignment.unit === 'sentence'
              ? 'Texte et traduction, phrase par phrase'
              : 'Texte et traduction, vers par vers'
            : alignment.stanzas.length > 1
              ? 'Texte et traduction, couplet par couplet'
              : 'Texte et traduction'}
        </h2>
        {hasLiteral && (
          <button
            type="button"
            onClick={() => setShowLiteral(v => !v)}
            aria-pressed={showLiteral}
            className={cn(
              'shrink-0 text-xs font-medium rounded-full border px-3 py-1 transition-colors',
              showLiteral
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            Mot à mot {showLiteral ? '✓' : ''}
          </button>
        )}
      </div>

      {alignment.kind === 'verses' ? (
        <div className="space-y-6">
          {alignment.stanzas.map((stanza, i) => (
            <div key={i} className="space-y-3 border-l-2 border-primary/20 pl-4">
              {stanza.map((verse, j) => (
                <VerseRow key={j} verse={verse} showLiteral={showLiteral} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {alignment.stanzas.map((stanza, i) => (
            <div key={i} className="space-y-2 border-l-2 border-primary/20 pl-4">
              <VerseRow verse={stanza} showLiteral={showLiteral} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
