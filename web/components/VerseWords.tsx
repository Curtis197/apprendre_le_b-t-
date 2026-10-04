'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { setMarkerMeaning } from '@/lib/lexicon-links-data'
import { cn } from '@/lib/utils'
import { readerTokens, type ReaderToken, type VerseWords as VerseData } from '@/lib/word-blocks'

/** B: running text, tap a word for a bubble. A: word boxes with the exact gloss under each word. */
export type WordMode = 'A' | 'B'

interface Props {
  verse: VerseData
  mode: WordMode
  /** Index of the token shown open on first render (tests only; pages never pass it). */
  initialOpen?: number | null
  canEditMarkers?: boolean
}

const POS_LABELS: Record<string, string> = {
  noun: 'Nom', verb: 'Verbe', adj: 'Adj.', adv: 'Adv.',
  name: 'Nom propre', num: 'Num.', interj: 'Interj.',
  prep: 'Prép.', conj: 'Conj.', pron: 'Pron.', part: 'Particule',
}

function glossOf(tk: ReaderToken): string {
  if (tk.gloss) return tk.gloss
  const markerMeaning = tk.lex?.kind === 'marker' ? tk.lex.marker.meaning : tk.marker?.meaning
  return tk.isMarker ? `⟨${markerMeaning || 'à préciser'}⟩` : '+'
}

function DictionaryPart({ tk }: { tk: ReaderToken }) {
  const lex = tk.lex
  if (!lex) {
    return tk.isMarker ? null : <p className="border-t border-border pt-1.5 text-xs text-muted-foreground">Pas encore dans le lexique.</p>
  }
  if (lex.kind === 'marker') return null // shown by the marker block below
  const senses = [...lex.senses].sort((a, b) => Number(b.id === lex.senseId) - Number(a.id === lex.senseId))
  return (
    <div className="space-y-1 border-t border-border pt-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Dans le lexique</span>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <strong>{lex.spelling}</strong>
        {lex.ipa && <span className="text-muted-foreground">[{lex.ipa}]</span>}
        {lex.pos[0] && <span className="rounded border border-border px-1.5 text-xs">{POS_LABELS[lex.pos[0]] ?? lex.pos[0]}</span>}
      </p>
      <ul className="list-disc pl-5">
        {senses.map(s => (
          <li key={s.id} data-current-sense={s.id === lex.senseId ? 'true' : undefined} className={cn(s.id === lex.senseId && 'font-semibold')}>
            {s.french}
            {s.context && <span className="font-normal text-muted-foreground"> ({s.context})</span>}
          </li>
        ))}
      </ul>
      {lex.description && <p>{lex.description}</p>}
      {lex.synonyms.length > 0 && <p className="text-xs text-muted-foreground">Synonymes : {lex.synonyms.join(', ')}</p>}
      {lex.spellings.length > 0 && <p className="text-xs text-muted-foreground">Autres graphies : {lex.spellings.join(', ')}</p>}
      <a href={`/lexicon/${lex.id}`} className="text-xs text-primary underline underline-offset-2">Voir la fiche du lexique</a>
    </div>
  )
}

function MarkerForm({ lexId }: { lexId: string }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState({ type: '', meaning: '', french: '' })
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState(false)
  if (done) return <p className="text-xs text-primary">Merci ! Le sens apparaîtra au prochain chargement.</p>
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
        Préciser le sens
      </button>
    )
  }
  const field = (k: 'type' | 'meaning' | 'french', label: string, max: number) => (
    <label className="block space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <input
        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground"
        value={v[k]}
        maxLength={max}
        onChange={e => setV({ ...v, [k]: e.target.value })}
      />
    </label>
  )
  return (
    <div className="space-y-2">
      {field('type', 'Type (ex : temps, aspect, mouvement)', 100)}
      {field('meaning', 'Ce qu’il indique (ex : futur)', 300)}
      {field('french', 'Comment le français le rend', 300)}
      {msg && <p className="text-xs text-destructive" role="alert">{msg}</p>}
      <button
        type="button"
        className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
        onClick={async () => {
          const res = await setMarkerMeaning(createClient(), lexId, v)
          if (res.error) setMsg(res.error)
          else setDone(true)
        }}
      >
        Enregistrer
      </button>
    </div>
  )
}

function WordDetail({
  tk, tokens, onJump, canEditMarkers,
}: {
  tk: ReaderToken
  tokens: ReaderToken[]
  onJump: (i: number) => void
  canEditMarkers?: boolean
}) {
  const partners = tokens.map((x, i) => ({ x, i })).filter(({ x }) => x.bid === tk.bid && x !== tk)
  const mk = tk.lex?.kind === 'marker' ? tk.lex.marker : tk.marker
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
      <DictionaryPart tk={tk} />
      {tk.isMarker && (
        <div className="space-y-1 border-t border-border pt-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Marqueur grammatical</span>
          {mk?.meaning ? (
            <>
              <p className="font-medium">
                {mk.type ? `${mk.type} : ` : ''}
                {mk.meaning}
              </p>
              {mk.french && <p>En français : {mk.french}</p>}
              {tk.lex?.id && (
                <a href={`/lexicon/${tk.lex.id}`} className="text-xs text-primary underline underline-offset-2">
                  Proposer une correction
                </a>
              )}
            </>
          ) : (
            <>
              <p className="text-muted-foreground">Marqueur grammatical, sens à préciser.</p>
              {canEditMarkers && tk.lex?.kind === 'marker' && (
                <MarkerForm lexId={tk.lex.id} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function VerseWords({ verse, mode, initialOpen = null, canEditMarkers }: Props) {
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
        {open != null && tokens[open] && (
          <WordDetail tk={tokens[open]} tokens={tokens} onJump={setOpen} canEditMarkers={canEditMarkers} />
        )}
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
      {open != null && tokens[open] && (
        <WordDetail tk={tokens[open]} tokens={tokens} onJump={setOpen} canEditMarkers={canEditMarkers} />
      )}
    </div>
  )
}
