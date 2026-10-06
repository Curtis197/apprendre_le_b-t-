'use client'
import { useEffect, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  emptyEntryForm, groupCandidates, senseSeed,
  type Candidate, type Dialect, type EntryForm as EntryFormValues,
} from '@/lib/lexicon-links'
import { findCandidates } from '@/lib/lexicon-links-data'
import type { LexSummary } from '@/lib/word-blocks'
import { EntryForm } from '@/components/word-link/EntryForm'

const btn = 'rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors'
const MAX_SHOWN = 6

/** The sense preselected on a candidate: the one equal to the gloss, else the first, else a new one. */
function defaultSense(e: LexSummary, gloss: string): string {
  const seed = senseSeed(gloss).toLowerCase()
  const match = e.senses.find(s => s.french.toLowerCase() === seed)
  return match ? match.id : (e.senses[0]?.id ?? 'new')
}

interface CardProps {
  c: Candidate
  variant: boolean
  kind: 'word' | 'marker'
  seed: string
  sel: string
  chooseSense: boolean
  namePrefix: string
  actionLabel: string
  busy: boolean
  onSelect: (sense: string) => void
  onAction: () => void
}

export function CandidateCard({ c, variant, kind, seed, sel, chooseSense, namePrefix, actionLabel, busy, onSelect, onAction }: CardProps) {
  const hasExactFrench = c.entry.senses.some(s => s.french.toLowerCase() === seed.toLowerCase())
  return (
    <div className="space-y-2 rounded-md border border-border p-2.5">
      <div className="flex items-baseline justify-between">
        {variant ? (
          <div>
            <span className="text-sm font-bold">{c.entry.spelling}</span>
            <span className="ml-2 text-xs text-muted-foreground">(variante de « {c.matched} »)</span>
          </div>
        ) : (
          <span className="text-sm font-bold">{c.entry.spelling}</span>
        )}
        <span className="text-xs text-muted-foreground">({c.entry.dialect})</span>
      </div>
      {kind === 'word' && chooseSense && (
        <div className="space-y-1">
          {c.entry.senses.map(s => (
            <label key={s.id} className="flex items-center gap-2 text-xs">
              <input
                type="radio"
                name={`${namePrefix}${c.entry.id}`}
                checked={sel === s.id}
                onChange={() => onSelect(s.id)}
              />
              <span>{s.french}</span>
            </label>
          ))}
          {seed && !hasExactFrench && (
            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                type="radio"
                name={`${namePrefix}${c.entry.id}`}
                checked={sel === 'new'}
                onChange={() => onSelect('new')}
              />
              <span>Nouveau sens : « {seed} »</span>
            </label>
          )}
        </div>
      )}
      {kind === 'word' && !chooseSense && c.entry.senses.length > 0 && (
        <p className="text-xs text-muted-foreground">{c.entry.senses.map(s => s.french).join(', ')}</p>
      )}
      <button type="button" className={`${btn} bg-primary text-primary-foreground`} disabled={busy} onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  )
}

interface Props {
  client: SupabaseClient
  kind: 'word' | 'marker'
  spelling: string
  gloss: string
  dialect: Dialect
  signedIn: boolean
  debounceMs?: number
  canUseExample: boolean
  chooseSense: boolean
  exactLabel: string
  variantLabel: string
  createLabel?: string
  submitLabel?: string
  busy: boolean
  error: string
  onChoose: (c: Candidate, sense: string | null) => void
  onChooseVariant: (c: Candidate, sense: string | null) => void
  onCreate: (form: EntryFormValues) => void
  onCreatingChange?: (creating: boolean) => void
  footer?: ReactNode
  formExtra?: ReactNode
}

/**
 * Search the lexicon for the typed spelling, then either pick an existing entry or open the creation form.
 * It decides nothing about what picking or creating does: the parent (resource editor, contribution form) does.
 */
export function LexiconPicker({
  client, kind, spelling, gloss, dialect, signedIn, debounceMs = 0, canUseExample, chooseSense,
  exactLabel, variantLabel, createLabel = 'Mot différent : créer l’entrée', submitLabel,
  busy, error, onChoose, onChooseVariant, onCreate, onCreatingChange, footer, formExtra,
}: Props) {
  const [creating, setCreating] = useState(false)
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [found, setFound] = useState<{ key: string; list: Candidate[] } | null>(null)

  // Results belong to the text they were searched for: when the text changes nothing stale is shown.
  const text = spelling.trim()
  const key = `${text}|${dialect}`
  const candidates = !text ? [] : found?.key === key ? found.list : null

  useEffect(() => {
    if (!signedIn || !text) return
    let cancelled = false
    const timer = setTimeout(() => {
      findCandidates(client, { text, dialect, limit: 7 }).then(list => {
        if (!cancelled) setFound({ key, list })
      })
    }, debounceMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [client, text, dialect, key, signedIn, debounceMs])

  if (creating) {
    return (
      <EntryForm
        kind={kind}
        initial={emptyEntryForm(spelling, gloss, dialect)}
        canUseExample={canUseExample}
        busy={busy}
        error={error}
        submitLabel={submitLabel}
        onSubmit={onCreate}
        onCancel={() => { setCreating(false); onCreatingChange?.(false) }}
      >
        {formExtra}
      </EntryForm>
    )
  }

  const grouped = groupCandidates(candidates ?? [], kind)
  const seed = senseSeed(gloss)
  const hasMore = (candidates?.length ?? 0) > MAX_SHOWN
  const shownExact = grouped.exact.slice(0, MAX_SHOWN)
  const shownVariants = grouped.variants.slice(0, Math.max(0, MAX_SHOWN - shownExact.length))
  const sel = (e: LexSummary) => picked[e.id] ?? defaultSense(e, gloss)
  const senseFor = (e: LexSummary) => (kind === 'word' ? sel(e) : null)

  return (
    <div className="space-y-3">
      {candidates === null && <p className="text-xs text-muted-foreground">Recherche dans le lexique…</p>}

      <div className="space-y-3">
        {shownExact.map(c => (
          <CandidateCard
            key={c.entry.id} c={c} variant={false} kind={kind} seed={seed} sel={sel(c.entry)} chooseSense={chooseSense}
            namePrefix="cand-sense-" actionLabel={exactLabel} busy={busy}
            onSelect={s => setPicked(prev => ({ ...prev, [c.entry.id]: s }))}
            onAction={() => onChoose(c, senseFor(c.entry))}
          />
        ))}

        {shownVariants.map(c => (
          <CandidateCard
            key={c.entry.id} c={c} variant kind={kind} seed={seed} sel={sel(c.entry)} chooseSense={chooseSense}
            namePrefix="var-sense-" actionLabel={variantLabel} busy={busy}
            onSelect={s => setPicked(prev => ({ ...prev, [c.entry.id]: s }))}
            onAction={() => onChooseVariant(c, senseFor(c.entry))}
          />
        ))}

        {grouped.otherKind.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-50/50 p-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
            {grouped.otherKind.map(c => (
              <p key={c.entry.id}>
                Cette graphie existe déjà comme {c.entry.kind === 'marker' ? 'marqueur grammatical' : 'mot'} :{' '}
                <a href={`/lexicon/${c.entry.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                  {c.entry.spelling}
                </a>
                . Vérifiez la nature du mot (« Mot » / « Marqueur grammatical ») ou proposez une correction depuis sa fiche.
              </p>
            ))}
          </div>
        )}

        {hasMore && (
          <p className="text-xs text-muted-foreground">
            D’autres entrées proches existent ; précisez la graphie pour les voir.
          </p>
        )}
      </div>

      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

      <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
        {kind === 'word' && text && (
          <button type="button" className={btn} onClick={() => { setCreating(true); onCreatingChange?.(true) }}>
            {createLabel}
          </button>
        )}
        {footer}
      </div>
    </div>
  )
}
