'use client'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { blockKey, blockWords, labelOf, normWord, type Side, type Unit } from '@/lib/word-blocks'
import {
  addWords, attachUnits, derive, editWords, EMPTY_MARKER, removeWord, setKind, setMeta, splitUnit,
  type MarkerDef, type VerseDraft,
} from '@/lib/word-link-editor'
import type { Focus } from './PairStrip'

interface Props {
  draft: VerseDraft
  focus: Focus | null
  /** Marker meanings of the whole editor (shared by every verse), keyed by normWord. */
  markers: Record<string, MarkerDef>
  onMarkerChange: (words: string, patch: Partial<MarkerDef>) => void
  onChange: (d: VerseDraft) => void
  onFocus: (f: Focus | null) => void
}

const inputClass = 'w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm'
const btn = 'rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  )
}

/** Correct, add or delete a word of the selected unit; links and notes follow (see word-link-editor). */
function WordTools({
  side, unit, words, onEdit, onAdd, onRemove,
}: {
  side: Side
  unit: Unit
  words: string[]
  onEdit: (nw: string[]) => string | null
  onAdd: (pos: number, nw: string[]) => void
  onRemove: (at: number) => void
}) {
  const current = unit.idx.map(i => words[i]).join(' ')
  const [value, setValue] = useState(current)
  const [added, setAdded] = useState('')
  const [error, setError] = useState('')
  const split = (s: string) => s.trim().split(/[ \t ]+/).filter(Boolean)
  const add = (pos: number) => {
    const nw = split(added)
    if (nw.length === 0) return setError('Écrivez le mot à ajouter.')
    setError('')
    onAdd(pos, nw)
  }
  return (
    <details className="rounded-md border border-border p-2.5">
      <summary className="cursor-pointer text-xs font-semibold">
        Corriger, ajouter ou supprimer un mot ({side === 'b' ? 'bhété' : 'mot à mot'})
      </summary>
      <div className="mt-2.5 space-y-2.5">
        <Field label={`Corriger « ${current} » (réunir ou séparer des mots est possible)`}>
          <input className={inputClass} value={value} onChange={e => setValue(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => setError(onEdit(split(value)) ?? '')}>Corriger</button>
          <button
            type="button"
            className={btn}
            disabled={unit.idx.length !== 1}
            title={unit.idx.length !== 1 ? 'Séparez d’abord les mots regroupés' : undefined}
            onClick={() => onRemove(unit.idx[0])}
          >
            Supprimer ce mot
          </button>
        </div>
        <Field label="Ajouter un mot manquant">
          <input className={inputClass} value={added} onChange={e => setAdded(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => add(unit.idx[0])}>Avant « {current} »</button>
          <button type="button" className={btn} onClick={() => add(unit.idx[unit.idx.length - 1] + 1)}>Après « {current} »</button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </details>
  )
}

export function BlockPanel({ draft, focus, markers, onMarkerChange, onChange, onFocus }: Props) {
  const r = derive(draft)
  if (!focus) {
    return <p className="text-sm text-muted-foreground">Touchez un bloc pour le regrouper, le corriger, ajouter une note ou le marquer comme marqueur grammatical.</p>
  }

  const side = focus.side
  const words = side === 'b' ? r.bw : r.gw
  const units = side === 'b' ? r.bu : r.gu
  const unit = units.find(u => u.idx.includes(focus.head))
  if (!unit) return null
  const pair = r.pairs.find(p => (side === 'b' ? p.b : p.g)?.head === unit.head)
  const b = pair?.b ?? null
  const key = b ? blockKey(b) : null
  const meta = key ? draft.meta[key] : undefined
  const bWords = b ? blockWords(r.bw, b.idx) : ''
  // Markers share one meaning per word: the model keys it by normWord of the block's words.
  const markerDef = b && meta?.isMarker ? (markers[normWord(bWords)] ?? EMPTY_MARKER) : null

  const apply = (next: VerseDraft) => onChange(next)

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3.5">
      <p className="text-sm font-semibold">
        {side === 'b' ? 'Bhété' : 'Mot à mot'} : « {labelOf(words, unit.idx)} »
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {unit.idx.length > 1 && (
          <button type="button" className={btn} onClick={() => apply(splitUnit(draft, side, unit.head))}>
            Séparer ces {unit.idx.length} mots
          </button>
        )}
        <span className="text-xs text-muted-foreground">Regrouper avec :</span>
        {units.filter(u => u !== unit).map(u => (
          <button
            key={u.head}
            type="button"
            className={cn(btn, side === 'b' && 'font-semibold')}
            onClick={() => {
              apply(attachUnits(draft, side, unit.head, u.head))
              onFocus({ side, head: u.head })
            }}
          >
            {labelOf(words, u.idx)}
          </button>
        ))}
      </div>

      <WordTools
        key={`${side}:${unit.idx.join('-')}:${words.join(' ')}`}
        side={side}
        unit={unit}
        words={words}
        onEdit={nw => {
          const res = editWords(draft, side, unit, nw)
          if ('error' in res) return res.error
          apply(res.draft)
          onFocus(null)
          return null
        }}
        onAdd={(pos, nw) => {
          apply(addWords(draft, side, pos, nw))
          onFocus(null)
        }}
        onRemove={at => {
          apply(removeWord(draft, side, at))
          onFocus(null)
        }}
      />

      {b && key && (
        <div className="space-y-3">
          <div className="inline-flex overflow-hidden rounded-md border border-border" role="group" aria-label="Nature du mot">
            <button
              type="button"
              className={cn('px-3 py-1.5 text-xs', !meta?.isMarker && 'bg-primary text-primary-foreground')}
              onClick={() => apply(setKind(draft, key, 'word', false))}
            >
              Mot
            </button>
            <button
              type="button"
              className={cn('px-3 py-1.5 text-xs', meta?.isMarker && 'bg-primary text-primary-foreground')}
              onClick={() => apply(setKind(draft, key, 'marker', !pair?.g))}
            >
              Marqueur grammatical
            </button>
          </div>

          {markerDef && (
            <div className={cn('space-y-2.5 rounded-md border border-l-4 border-violet-400 p-3', !markerDef.meaning && 'border-dashed')}>
              <p className="text-xs font-semibold">
                Marqueur grammatical{!markerDef.meaning && ', sens à préciser'}
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="Type (champ libre, ex : temps, aspect, mouvement)">
                  <input className={inputClass} value={markerDef.type} onChange={e => onMarkerChange(bWords, { type: e.target.value })} maxLength={100} />
                </Field>
                <Field label="Ce qu'il indique (ex : futur, en cours)">
                  <input className={inputClass} value={markerDef.meaning} onChange={e => onMarkerChange(bWords, { meaning: e.target.value })} maxLength={300} />
                </Field>
              </div>
              <Field label="Comment le français le rend (ex : « aller + verbe » : je vais venir)">
                <input className={inputClass} value={markerDef.french} onChange={e => onMarkerChange(bWords, { french: e.target.value })} maxLength={300} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={meta?.solo ?? false}
                  onChange={e => apply(setMeta(draft, key, { solo: e.target.checked }))}
                />
                Aucun mot du mot à mot ne lui correspond
              </label>
              <p className="text-xs text-muted-foreground">
                Le sens saisi ici s’applique à tous les blocs de cette ressource marqués comme marqueur avec ce mot.
              </p>
            </div>
          )}

          <Field label="Composition du mot (optionnel), ex : ghèhi (en haut) + wu (lieu)">
            <input className={inputClass} value={meta?.composition ?? ''} onChange={e => apply(setMeta(draft, key, { composition: e.target.value }))} maxLength={300} />
          </Field>
          <Field label={`Contexte ou explication de « ${bWords} » (optionnel)`}>
            <input className={inputClass} value={meta?.note ?? ''} onChange={e => apply(setMeta(draft, key, { note: e.target.value }))} maxLength={500} />
          </Field>
        </div>
      )}
    </div>
  )
}
