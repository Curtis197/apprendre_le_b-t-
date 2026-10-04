'use client'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { alignVerses, type Verse } from '@/lib/verses'
import type { VerseWords as VerseWordsData } from '@/lib/word-blocks'
import { InterlinearGloss } from './InterlinearGloss'
import { VerseWords, type WordMode } from './VerseWords'

interface Props {
  original: string
  literal?: string | null
  french?: string | null
  /** The mot à mot is optional to write and optional to read: hidden unless asked for. */
  defaultShowLiteral?: boolean
  /** Word blocks of the resource (get_resource_words). A verse without usable blocks renders as before. */
  words?: VerseWordsData[]
}

const MODE_KEY = 'word-reader-mode'

/** B (running text) by default; the reader's choice is remembered in this browser only. */
function useWordMode(): [WordMode, (m: WordMode) => void] {
  const [mode, setMode] = useState<WordMode>('B')
  useEffect(() => {
    try {
      const v = localStorage.getItem(MODE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration (localStorage is client-only)
      if (v === 'A' || v === 'B') setMode(v)
    } catch {
      // storage unavailable (private window): keep the default
    }
  }, [])
  const choose = (m: WordMode) => {
    setMode(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      // ignore
    }
  }
  return [mode, choose]
}

function Lines({ children, className }: { children: string; className?: string }) {
  return <p className={cn('whitespace-pre-wrap', className)}>{children}</p>
}

function ModeToggle({ mode, onChange }: { mode: WordMode; onChange: (m: WordMode) => void }) {
  const pill = (m: WordMode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === m}
      onClick={() => onChange(m)}
      className={cn(
        'shrink-0 text-xs font-medium rounded-full border px-3 py-1 transition-colors',
        mode === m ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  )
  return (
    <div className="flex gap-1.5" role="group" aria-label="Affichage des mots">
      {pill('B', 'Texte')}
      {pill('A', 'Mot par mot')}
    </div>
  )
}

function VerseRow({
  verse,
  showLiteral,
  words,
  mode,
}: {
  verse: Verse
  showLiteral: boolean
  words?: VerseWordsData
  mode: WordMode
}) {
  return (
    <div className="space-y-0.5">
      {words ? (
        <VerseWords verse={words} mode={mode} />
      ) : (
        <Lines className="font-semibold text-foreground leading-relaxed">{verse.original}</Lines>
      )}
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
 *
 * Verses that have word blocks (see lib/word-blocks.ts) show their words tappable; a verse is
 * numbered like the gutter of the entry form (n-th non-empty line), which is what the blocks use.
 */
export function VerseTranslation({ original, literal, french, defaultShowLiteral = false, words }: Props) {
  const alignment = useMemo(() => alignVerses(original, literal, french), [original, literal, french])
  const hasLiteral = Boolean(literal?.trim())
  const [showLiteral, setShowLiteral] = useState(defaultShowLiteral)
  const [mode, setMode] = useWordMode()
  const usable = useMemo(
    () => new Map((words ?? []).filter(w => !w.stale && w.blocks.length > 0).map(w => [w.verse_no, w])),
    [words],
  )

  // A verse's words are used only when its line is the one the reader shows: the database numbers lines
  // by trimming space and tab only, the reader by trim(), so lines of odd whitespace can shift the numbers.
  const wordsFor = (no: number, line: string) => {
    const w = usable.get(no)
    return w && w.bete_line.trim() === line.trim() ? w : undefined
  }

  if (alignment.kind === 'single') {
    const w = wordsFor(1, original)
    if (!w) return <InterlinearGloss original={original} literal={literal} final={french} variant="card" />
    return (
      <section className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Texte et traduction</h2>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
        <VerseRow
          verse={{ original, literal: literal ?? undefined, french: french ?? undefined }}
          showLiteral={false}
          words={w}
          mode={mode}
        />
      </section>
    )
  }

  if (alignment.kind === 'misaligned') {
    return <InterlinearGloss original={original} literal={literal} final={french} variant="card" />
  }

  // Verse numbers, counted over all stanzas like the gutter does.
  let n = 0
  const numbered =
    alignment.kind === 'verses' ? alignment.stanzas.map(stanza => stanza.map(verse => ({ verse, no: ++n }))) : []
  const wordsApply =
    alignment.kind === 'verses' &&
    alignment.unit === 'line' &&
    numbered.some(stanza => stanza.some(({ verse, no }) => wordsFor(no, verse.original)))

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
        <div className="flex items-center gap-2">
          {wordsApply && <ModeToggle mode={mode} onChange={setMode} />}
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
      </div>

      {alignment.kind === 'verses' ? (
        <div className="space-y-6">
          {numbered.map((stanza, i) => (
            <div key={i} className="space-y-3 border-l-2 border-primary/20 pl-4">
              {stanza.map(({ verse, no }) => (
                <VerseRow
                  key={no}
                  verse={verse}
                  showLiteral={showLiteral}
                  words={wordsApply ? wordsFor(no, verse.original) : undefined}
                  mode={mode}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {alignment.stanzas.map((stanza, i) => (
            <div key={i} className="space-y-2 border-l-2 border-primary/20 pl-4">
              <VerseRow verse={stanza} showLiteral={showLiteral} mode={mode} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
