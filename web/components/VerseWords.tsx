'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { readerTokens, type ReaderToken, type VerseWords as VerseData } from '@/lib/word-blocks'

/** B: running text, tap a word for a bubble. A: word boxes with the exact gloss under each word. */
export type WordMode = 'A' | 'B'

interface Props {
  verse: VerseData
  mode: WordMode
  /** Index of the token shown open on first render (tests only; pages never pass it). */
  initialOpen?: number | null
}

function glossOf(tk: ReaderToken): string {
  if (tk.gloss) return tk.gloss
  return tk.isMarker ? `⟨${tk.marker?.meaning || 'à préciser'}⟩` : '+'
}

function WordDetail({ tk, tokens, onJump }: { tk: ReaderToken; tokens: ReaderToken[]; onJump: (i: number) => void }) {
  const partners = tokens.map((x, i) => ({ x, i })).filter(({ x }) => x.bid === tk.bid && x !== tk)
  const mk = tk.marker
  return (
    <div role="dialog" aria-label={tk.whole} className="max-w-md space-y-1.5 rounded-lg border border-l-4 border-primary/40 border-l-primary bg-card p-3 text-sm font-normal not-italic text-foreground shadow-md">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-semibold">{tk.whole}</span>
        <span className="text-muted-foreground">→</span>
        <strong>{tk.gloss ?? (tk.isMarker ? `⟨${mk?.meaning || 'à préciser'}⟩` : 'sens à préciser')}</strong>
      </div>
      {partners.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5">
          Lié à :
          {partners.map(({ x, i }) => (
            <button
              key={i}
              type="button"
              onClick={() => onJump(i)}
              className="rounded-md border border-primary/50 bg-primary/10 px-2 py-0.5 font-semibold"
            >
              {x.t}
            </button>
          ))}
          <span className="text-xs text-muted-foreground">(un seul mot, séparé dans la phrase)</span>
        </p>
      )}
      {tk.composition && <p className="text-xs text-muted-foreground">Composition : {tk.composition}</p>}
      {tk.note && <p>{tk.note}</p>}
      {tk.isMarker && (
        <div className="space-y-1 border-t border-border pt-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Marqueur grammatical</span>
          {mk?.meaning ? (
            <p className="font-medium">
              {mk.type ? `${mk.type} : ` : ''}
              {mk.meaning}
            </p>
          ) : (
            <p className="text-muted-foreground">Marqueur grammatical, sens à préciser.</p>
          )}
          {mk?.french && <p>En français : {mk.french}</p>}
        </div>
      )}
    </div>
  )
}

export function VerseWords({ verse, mode, initialOpen = null }: Props) {
  const tokens = readerTokens(verse)
  const [open, setOpen] = useState<number | null>(initialOpen)
  const toggle = (i: number) => setOpen(open === i ? null : i)
  const tied = (tk: ReaderToken) => open != null && tokens[open] != null && tk.runs.length > 1 && tokens[open].bid === tk.bid

  if (tokens.length === 0) return null

  if (mode === 'A') {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {tokens.map((tk, i) => (
            <button
              key={i}
              type="button"
              aria-expanded={open === i}
              data-tied={tied(tk) ? 'true' : undefined}
              onClick={() => toggle(i)}
              className={cn(
                'inline-flex min-w-[3.5rem] flex-col items-center rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-center',
                open === i && 'border-primary bg-primary/10',
                tied(tk) && 'border-primary bg-primary/10',
                tk.isMarker && 'border-dashed',
              )}
            >
              <span className="text-sm font-semibold text-foreground">{tk.t}</span>
              <span className="text-xs italic text-primary">{tk.k > 0 ? `↔ ${tk.runs[0]}` : glossOf(tk)}</span>
              {tk.k === 0 && tk.runs.length > 1 && (
                <span className="text-[10px] text-muted-foreground">↔ {tk.runs.slice(1).join(', ')}</span>
              )}
            </button>
          ))}
        </div>
        {open != null && tokens[open] && <WordDetail tk={tokens[open]} tokens={tokens} onJump={setOpen} />}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="font-semibold leading-loose text-foreground">
        {tokens.map((tk, i) => (
          <span key={i}>
            <button
              type="button"
              aria-expanded={open === i}
              data-tied={tied(tk) ? 'true' : undefined}
              onClick={() => toggle(i)}
              className={cn(
                'border-b-2 border-dotted border-primary/60 font-semibold',
                open === i && 'bg-primary/10',
                tied(tk) && 'border-solid bg-primary/10',
                !tk.gloss && !tk.isMarker && 'border-amber-500',
              )}
            >
              {tk.t}
            </button>{' '}
          </span>
        ))}
      </p>
      {open != null && tokens[open] && <WordDetail tk={tokens[open]} tokens={tokens} onJump={setOpen} />}
    </div>
  )
}
