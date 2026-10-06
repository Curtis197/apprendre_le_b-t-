'use client'
import { useState, type ReactNode } from 'react'
import { DIALECTS, ENTRY_CATEGORIES, checkEntryForm, type Dialect, type EntryForm as EntryFormValues } from '@/lib/lexicon-links'

interface Props {
  kind: 'word' | 'marker'
  initial: EntryFormValues
  /** The verse has a French line, so it can be proposed as an example sentence. */
  canUseExample: boolean
  busy: boolean
  error: string
  onSubmit: (form: EntryFormValues) => void
  onCancel: () => void
  submitLabel?: string
  busyLabel?: string
  /** Extra fields shown before the buttons (the contribution form's example sentence and recording). */
  children?: ReactNode
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

/** The whole lexical sheet of a new entry. Everything is optional except one spelling and (for a word) one sense. */
export function EntryForm({ kind, initial, canUseExample, busy, error, onSubmit, onCancel, submitLabel = 'Créer et lier', busyLabel = 'Création…', children }: Props) {
  const [f, setF] = useState(initial)
  const [local, setLocal] = useState('')
  const set = (patch: Partial<EntryFormValues>) => setF(prev => ({ ...prev, ...patch }))
  const setSense = (i: number, patch: Partial<{ french: string; context: string }>) =>
    set({ senses: f.senses.map((s, k) => (k === i ? { ...s, ...patch } : s)) })

  function submit() {
    const problem = checkEntryForm(f, kind)
    setLocal(problem ?? '')
    if (!problem) onSubmit(f)
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <p className="text-sm font-semibold">{kind === 'word' ? 'Nouvelle entrée du lexique' : 'Nouveau marqueur grammatical'}</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Graphie (alphabet latin)">
          <input className={inputClass} value={f.spelling} maxLength={100} onChange={e => set({ spelling: e.target.value })} />
        </Field>
        <Field label="Transcription (API / forme de la Bible, optionnel)">
          <input className={inputClass} value={f.ipa} maxLength={100} onChange={e => set({ ipa: e.target.value })} />
        </Field>
        <Field label="Dialecte">
          <select className={inputClass} value={f.dialect} onChange={e => set({ dialect: e.target.value as Dialect })}>
            {DIALECTS.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </Field>
        {kind === 'word' && (
          <Field label="Catégorie">
            <select className={inputClass} value={f.category} onChange={e => set({ category: e.target.value })}>
              <option value="">—</option>
              {ENTRY_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {kind === 'word' && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold">Sens (le premier vient du mot à mot, sans article)</legend>
          {f.senses.map((s, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-2">
              <Field label={i === 0 ? 'Mot en français' : `Sens ${i + 1}`}>
                <input className={inputClass} value={s.french} maxLength={200} onChange={e => setSense(i, { french: e.target.value })} />
              </Field>
              <Field label="Contexte (optionnel)">
                <input className={inputClass} value={s.context} maxLength={300} onChange={e => setSense(i, { context: e.target.value })} />
              </Field>
            </div>
          ))}
          <button type="button" className={btn} onClick={() => set({ senses: [...f.senses, { french: '', context: '' }] })}>
            Ajouter un sens
          </button>
        </fieldset>
      )}

      {kind === 'word' && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Synonymes (séparés par des virgules)">
            <input className={inputClass} value={f.synonyms} onChange={e => set({ synonyms: e.target.value })} />
          </Field>
          <Field label="Forme de base (infinitif, singulier…)">
            <input className={inputClass} value={f.lemma} maxLength={200} onChange={e => set({ lemma: e.target.value })} />
          </Field>
        </div>
      )}
      <Field label="Définition (optionnel)">
        <textarea className={inputClass} rows={2} value={f.description} maxLength={2000} onChange={e => set({ description: e.target.value })} />
      </Field>
      <Field label="Notes d’usage (optionnel)">
        <textarea className={inputClass} rows={2} value={f.notes} maxLength={2000} onChange={e => set({ notes: e.target.value })} />
      </Field>

      {kind === 'word' && canUseExample && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.useExample} onChange={e => set({ useExample: e.target.checked })} />
          Utiliser ce vers comme phrase d’exemple
        </label>
      )}

      {children}
      {(local || error) && <p className="text-xs text-destructive" role="alert">{local || error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${btn} bg-primary text-primary-foreground`} disabled={busy} onClick={submit}>
          {busy ? busyLabel : submitLabel}
        </button>
        <button type="button" className={btn} onClick={onCancel}>Annuler</button>
      </div>
    </div>
  )
}
