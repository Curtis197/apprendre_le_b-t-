'use client'
import { useState } from 'react'
import { useDialect } from '@/context/DialectContext'
import { DIALECTS, DIALECT_KEYS, type DialectKey } from '@/lib/dialect'
import { groupedSymbols, type PhoneticSymbol } from '@/lib/phonetic-alphabet'

const SHORT: Record<DialectKey, string> = { western: 'Occidental', eastern: 'Oriental', northern: 'Septentrional' }
const fmt = (n: number) => n.toLocaleString('fr-FR')

function GlyphButton({ ch, count, onCopy }: { ch: string; count: number; onCopy: (ch: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onCopy(ch)}
      aria-label={`Copier ${ch}`}
      title={`Copier ${ch}`}
      className="flex min-w-[84px] flex-1 flex-col items-center gap-0.5 rounded-lg bg-muted/60 px-1.5 pb-2 pt-2.5 transition-colors hover:bg-muted"
    >
      <span className="phonetic text-4xl font-semibold leading-tight text-primary">{ch}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground">{fmt(count)}</span>
    </button>
  )
}

function SymbolCard({ sym, max, onCopy }: { sym: PhoneticSymbol; max: number; onCopy: (ch: string) => void }) {
  const peak = Math.max(sym.frequency, sym.upperFrequency ?? 0)
  return (
    <article className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5">
      <div className="flex flex-wrap gap-2">
        <GlyphButton ch={sym.glyph} count={sym.frequency} onCopy={onCopy} />
        {sym.upper && (sym.upperFrequency ?? 0) > 0 && (
          <GlyphButton ch={sym.upper} count={sym.upperFrequency ?? 0} onCopy={onCopy} />
        )}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-secondary" style={{ width: `${Math.max(3, (peak / max) * 100)}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {sym.codePoint ? <span className="font-mono">{sym.codePoint}</span> : 'groupe de lettres'}
      </p>
      {sym.note ? (
        <p className="text-sm">
          {sym.note}{' '}
          {sym.noteNeedsReview && (
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-accent">à valider</span>
          )}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">Note à venir</p>
      )}
      <div className="mt-auto space-y-1 border-t border-dashed border-border pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Exemples</p>
        {sym.examples.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">Exemples à venir</p>
        ) : (
          <ul className="space-y-0.5 text-sm">
            {sym.examples.map(ex => (
              <li key={ex.bete}><span className="phonetic font-semibold">{ex.bete}</span> — {ex.french}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}

export function AlphabetReference() {
  const { dialect, setDialect } = useDialect()
  const [toast, setToast] = useState('')
  const groups = groupedSymbols(dialect)
  const max = Math.max(...groups.flatMap(g => g.symbols.map(s => Math.max(s.frequency, s.upperFrequency ?? 0))))

  async function copy(ch: string) {
    try {
      await navigator.clipboard.writeText(ch)
      setToast(`« ${ch} » copié`)
    } catch {
      setToast('Copie impossible : sélectionnez le symbole')
    }
    setTimeout(() => setToast(''), 1600)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1.5">
        <div role="tablist" aria-label="Dialecte" className="inline-flex max-w-full gap-0.5 self-start overflow-x-auto rounded-lg bg-muted p-0.5">
          {DIALECT_KEYS.map(key => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={dialect === key}
              onClick={() => setDialect(key)}
              className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                dialect === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {SHORT[key]}
            </button>
          ))}
        </div>
        <p className="font-heading text-sm font-semibold text-primary">{DIALECTS[dialect].name}</p>
      </div>

      {groups.map(g => (
        <section key={g.id} aria-labelledby={`g-${g.id}`} className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 id={`g-${g.id}`} className="font-heading text-lg font-bold">{g.title}</h2>
            <p className="text-sm text-muted-foreground">{g.hint}</p>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 210px), 1fr))' }}>
            {g.symbols.map(sym => <SymbolCard key={sym.id} sym={sym} max={max} onCopy={copy} />)}
          </div>
        </section>
      ))}

      <p className="max-w-prose text-sm text-muted-foreground">
        Les nombres indiquent combien de fois le symbole apparaît dans le Nouveau Testament de ce dialecte.
        Taper sur un symbole le copie.
      </p>

      <div role="status" className={`fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm text-background transition-opacity ${toast ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        {toast}
      </div>
    </div>
  )
}
