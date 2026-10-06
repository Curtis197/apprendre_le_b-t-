'use client'
import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createOutcome, emptyEntryForm, senseSeed,
  type Candidate, type Dialect, type EntryForm as EntryFormValues,
} from '@/lib/lexicon-links'
import {
  addSense, addSpelling, createEntry, getEntry, setMarkerMeaning,
} from '@/lib/lexicon-links-data'
import { cn } from '@/lib/utils'
import type { LexSummary } from '@/lib/word-blocks'
import type { BlockMeta } from '@/lib/word-link-editor'
import { LexiconPicker } from '@/components/lexicon/LexiconPicker'

interface Props {
  client: SupabaseClient
  kind: 'word' | 'marker'
  words: string            // the block's Bété words ("ghèhi-wu")
  gloss: string            // the block's mot à mot ("au ciel"), '' for a solo marker
  dialect: Dialect         // default dialect of the resource
  meta: BlockMeta
  entry: LexSummary | null // the linked entry (from the editor cache)
  example: { bete: string; french: string; literal: string } | null
  signedIn: boolean
  onLink: (entry: LexSummary, senseId: string | null) => void   // also caches the entry
  onUnlink: () => void
}

const inputClass = 'w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm'
const btn = 'rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors'

export function LexiconPanel({
  client, kind, words, gloss, dialect, meta, entry, example, signedIn, onLink, onUnlink,
}: Props) {
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  // Sub-inputs for linked entry
  const [showSpelling, setShowSpelling] = useState(false)
  const [spellingInput, setSpellingInput] = useState('')
  const [showSense, setShowSense] = useState(false)
  const [senseFrench, setSenseFrench] = useState('')
  const [senseContext, setSenseContext] = useState('')

  // Marker fields
  const [markerType, setMarkerType] = useState(entry?.marker.type ?? '')
  const [markerMeaning, setMarkerMeaningText] = useState(entry?.marker.meaning ?? '')
  const [markerFrench, setMarkerFrench] = useState(entry?.marker.french ?? '')
  const [prevEntry, setPrevEntry] = useState(entry)

  if (entry !== prevEntry) {
    setPrevEntry(entry)
    if (entry?.kind === 'marker') {
      setMarkerType(entry.marker.type ?? '')
      setMarkerMeaningText(entry.marker.meaning ?? '')
      setMarkerFrench(entry.marker.french ?? '')
    }
  }

  useEffect(() => {
    if (signedIn) {
      client.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    }
  }, [client, signedIn])

  const isLinked = Boolean(meta.lexiconId && entry)
  const isLinkedMissing = Boolean(meta.lexiconId && !entry)

  async function handleAddSpelling() {
    if (!entry || !spellingInput.trim()) return
    setBusy(true)
    setError('')
    const res = await addSpelling(client, entry.id, spellingInput)
    if (res.error) {
      setError(res.error)
      setBusy(false)
      return
    }
    const refreshed = await getEntry(client, entry.id)
    setBusy(false)
    setShowSpelling(false)
    setSpellingInput('')
    if (refreshed) onLink(refreshed, meta.translationId)
  }

  async function handleAddSense() {
    if (!entry || !senseFrench.trim()) return
    setBusy(true)
    setError('')
    const uid = userId ?? (await client.auth.getUser()).data.user?.id ?? ''
    const res = await addSense(client, entry.id, uid, { french: senseFrench, context: senseContext })
    if (res.error) {
      setError(res.error)
      setBusy(false)
      return
    }
    const refreshed = await getEntry(client, entry.id)
    setBusy(false)
    setShowSense(false)
    setSenseFrench('')
    setSenseContext('')
    if (refreshed) {
      const added = refreshed.senses.find(s => s.french.toLowerCase() === senseFrench.trim().toLowerCase())
      onLink(refreshed, added?.id ?? meta.translationId)
    }
  }

  async function handleSaveMarker() {
    if (!entry) return
    setBusy(true)
    setError('')
    const res = await setMarkerMeaning(client, entry.id, {
      type: markerType,
      meaning: markerMeaning,
      french: markerFrench,
    })
    if (res.error) {
      setError(res.error)
      setBusy(false)
      return
    }
    const refreshed = await getEntry(client, entry.id)
    setBusy(false)
    if (refreshed) onLink(refreshed, null)
  }

  async function linkCandidate(cEntry: LexSummary, chosenSenseId: string | null) {
    const finalSenseId = chosenSenseId
    if (kind === 'word' && chosenSenseId === 'new') {
      setBusy(true)
      const uid = userId ?? (await client.auth.getUser()).data.user?.id ?? ''
      const addRes = await addSense(client, cEntry.id, uid, { french: senseSeed(gloss), context: '' })
      if (addRes.error) {
        setError(addRes.error)
        setBusy(false)
        return
      }
      const refreshed = await getEntry(client, cEntry.id)
      setBusy(false)
      if (refreshed) {
        const added = refreshed.senses.find(s => s.french.toLowerCase() === senseSeed(gloss).toLowerCase())
        onLink(refreshed, added?.id ?? null)
      }
      return
    }
    onLink(cEntry, finalSenseId)
  }

  async function linkVariant(c: Candidate, sense: string | null) {
    setBusy(true)
    setError('')
    const spellRes = await addSpelling(client, c.entry.id, words)
    // ignore spelling_exists
    if (spellRes.error && !spellRes.error.includes('déjà')) {
      setError(spellRes.error)
      setBusy(false)
      return
    }
    const refreshed = await getEntry(client, c.entry.id)
    setBusy(false)
    await linkCandidate(refreshed ?? c.entry, sense)
  }

  /** One place for what a create answer does here: an error stays on the form, an existing entry is linked with a notice. */
  function finishCreate(res: Awaited<ReturnType<typeof createEntry>>, createdKind: 'word' | 'marker') {
    const out = createOutcome(res, createdKind)
    if (out.type === 'error') {
      setError(out.message)
      return
    }
    setNotice(out.type === 'existing' ? out.notice : '')
    onLink(out.entry, out.senseId)
  }

  async function handleCreateFast() {
    setBusy(true)
    setError('')
    const res = await createEntry(client, { form: emptyEntryForm(words, gloss, dialect), kind: 'word' })
    setBusy(false)
    finishCreate(res, 'word')
  }

  async function handleCreateMarkerImmediate() {
    setBusy(true)
    setError('')
    const res = await createEntry(client, { form: emptyEntryForm(words, '', dialect), kind: 'marker' })
    setBusy(false)
    finishCreate(res, 'marker')
  }

  async function handleCustomFormSubmit(form: EntryFormValues) {
    setBusy(true)
    setError('')
    const res = await createEntry(client, { form, kind, example: form.useExample ? example : null })
    setBusy(false)
    finishCreate(res, kind)
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {kind === 'marker' ? 'Lexique : marqueur grammatical' : 'Lexique'}
      </p>

      {!signedIn ? (
        <p className="text-xs text-muted-foreground">Connectez-vous pour relier ce mot au lexique.</p>
      ) : isLinkedMissing ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">Entrée du lexique introuvable</p>
          <button type="button" className={btn} onClick={onUnlink}>Délier</button>
        </div>
      ) : isLinked && entry ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="space-y-0.5">
              <span className="text-base font-bold">{entry.spelling}</span>
              {entry.ipa && <span className="ml-2 text-xs text-muted-foreground">[{entry.ipa}]</span>}
              <span className="ml-2 text-xs text-muted-foreground">({entry.dialect})</span>
              {entry.kind === 'marker' && (
                <span className="ml-2 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
                  Marqueur grammatical
                </span>
              )}
            </div>
            <a
              href={`/lexicon/${entry.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary underline underline-offset-2"
            >
              Compléter la fiche
            </a>
          </div>

          {entry.spellings.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Autres graphies : {entry.spellings.join(', ')}
            </p>
          )}

          {notice && <p className="text-xs text-amber-700 dark:text-amber-300" role="status">{notice}</p>}

          {entry.kind === 'word' ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Sens :</p>
              <div className="space-y-1.5">
                {entry.senses.map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`sense-${entry.id}`}
                      checked={meta.translationId === s.id}
                      onChange={() => onLink(entry, s.id)}
                    />
                    <span>{s.french}</span>
                    {s.context && <span className="text-xs text-muted-foreground">({s.context})</span>}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className={cn('space-y-2.5 rounded-md border border-l-4 border-violet-400 p-3', !entry.marker.meaning && 'border-dashed')}>
              <p className="text-xs font-semibold">
                Marqueur grammatical{!entry.marker.meaning && ', sens à préciser'}
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="block space-y-1 text-xs text-muted-foreground">
                  <span>Type (champ libre, ex : temps, aspect, mouvement)</span>
                  <input
                    className={inputClass}
                    value={markerType}
                    maxLength={100}
                    onChange={e => setMarkerType(e.target.value)}
                  />
                </label>
                <label className="block space-y-1 text-xs text-muted-foreground">
                  <span>Ce qu’il indique (ex : futur, en cours)</span>
                  <input
                    className={inputClass}
                    value={markerMeaning}
                    maxLength={300}
                    onChange={e => setMarkerMeaningText(e.target.value)}
                  />
                </label>
              </div>
              <label className="block space-y-1 text-xs text-muted-foreground">
                <span>Comment le français le rend (ex : « aller + verbe » : je vais venir)</span>
                <input
                  className={inputClass}
                  value={markerFrench}
                  maxLength={300}
                  onChange={e => setMarkerFrench(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={`${btn} bg-primary text-primary-foreground`}
                disabled={busy}
                onClick={handleSaveMarker}
              >
                Enregistrer le sens
              </button>
            </div>
          )}

          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border">
            <button type="button" className={btn} onClick={() => { setNotice(''); onUnlink() }}>Délier</button>
            <button type="button" className={btn} onClick={() => setShowSpelling(!showSpelling)}>
              Ajouter une graphie
            </button>
            {entry.kind === 'word' && (
              <button type="button" className={btn} onClick={() => setShowSense(!showSense)}>
                Ajouter un sens
              </button>
            )}
          </div>

          {showSpelling && (
            <div className="flex items-center gap-2 rounded-md border border-border p-2">
              <input
                className={inputClass}
                placeholder="Nouvelle graphie"
                value={spellingInput}
                maxLength={100}
                onChange={e => setSpellingInput(e.target.value)}
              />
              <button type="button" className={`${btn} bg-primary text-primary-foreground`} disabled={busy} onClick={handleAddSpelling}>
                Ajouter
              </button>
              <button type="button" className={btn} onClick={() => setShowSpelling(false)}>Annuler</button>
            </div>
          )}

          {showSense && (
            <div className="space-y-2 rounded-md border border-border p-2">
              <input
                className={inputClass}
                placeholder="Mot en français"
                value={senseFrench}
                maxLength={200}
                onChange={e => setSenseFrench(e.target.value)}
              />
              <input
                className={inputClass}
                placeholder="Contexte (optionnel)"
                value={senseContext}
                maxLength={300}
                onChange={e => setSenseContext(e.target.value)}
              />
              <div className="flex gap-2">
                <button type="button" className={`${btn} bg-primary text-primary-foreground`} disabled={busy} onClick={handleAddSense}>
                  Ajouter ce sens
                </button>
                <button type="button" className={btn} onClick={() => setShowSense(false)}>Annuler</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <LexiconPicker
          client={client}
          kind={kind}
          spelling={words}
          gloss={gloss}
          dialect={dialect}
          signedIn={signedIn}
          canUseExample={example !== null}
          chooseSense
          exactLabel={kind === 'marker' ? 'Lier à ce marqueur' : 'Lier à cette entrée'}
          variantLabel={`C’est le même mot : ajouter la graphie « ${words} » et lier`}
          busy={busy}
          error={error}
          onChoose={(c, sense) => linkCandidate(c.entry, sense)}
          onChooseVariant={linkVariant}
          onCreate={handleCustomFormSubmit}
          footer={
            kind === 'word' ? (
              <button type="button" className={btn} disabled={busy} onClick={handleCreateFast}>
                Créer vite, avec le mot à mot seul
              </button>
            ) : (
              <button type="button" className={btn} disabled={busy} onClick={handleCreateMarkerImmediate}>
                Créer ce marqueur (sens à préciser plus tard)
              </button>
            )
          }
        />
      )}
    </div>
  )
}
