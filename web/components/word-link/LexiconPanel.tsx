'use client'
import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  emptyEntryForm, groupCandidates, senseSeed,
  type Candidate, type Dialect, type EntryForm as EntryFormValues,
} from '@/lib/lexicon-links'
import {
  addSense, addSpelling, createEntry, findCandidates, getEntry, setMarkerMeaning,
} from '@/lib/lexicon-links-data'
import { cn } from '@/lib/utils'
import type { LexSummary } from '@/lib/word-blocks'
import type { BlockMeta } from '@/lib/word-link-editor'
import { EntryForm } from './EntryForm'

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
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [mode, setMode] = useState<'choose' | 'create'>('choose')
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

  useEffect(() => {
    if (meta.lexiconId || !signedIn) {
      return
    }
    let cancelled = false
    findCandidates(client, { text: words, dialect, limit: 7 }).then(res => {
      if (!cancelled) setCandidates(res)
    })
    return () => {
      cancelled = true
    }
  }, [client, words, kind, dialect, meta.lexiconId, signedIn])

  // Selected sense for candidates
  const [candidateSenses, setCandidateSenses] = useState<Record<string, string>>({})

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

  async function linkVariant(c: Candidate) {
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
    const targetEntry = refreshed ?? c.entry
    const chosen = candidateSenses[targetEntry.id] ?? defaultSense(targetEntry)
    await linkCandidate(targetEntry, chosen)
  }

  function defaultSense(e: LexSummary): string {
    const seed = senseSeed(gloss).toLowerCase()
    const match = e.senses.find(s => s.french.toLowerCase() === seed)
    return match ? match.id : (e.senses[0]?.id ?? 'new')
  }

  async function handleCreateFast() {
    setBusy(true)
    setError('')
    const res = await createEntry(client, {
      form: emptyEntryForm(words, gloss, dialect),
      kind: 'word',
    })
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    if (res.data) {
      if (res.data.existed && res.data.entry.kind !== 'word') {
        setError(`Cette graphie existe déjà comme marqueur grammatical : ${res.data.entry.spelling}.`)
        return
      }
      onLink(res.data.entry, res.data.entry.senseId ?? res.data.senseIds[0] ?? null)
    }
  }

  async function handleCreateMarkerImmediate() {
    setBusy(true)
    setError('')
    const res = await createEntry(client, {
      form: emptyEntryForm(words, '', dialect),
      kind: 'marker',
    })
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    if (res.data) {
      onLink(res.data.entry, null)
    }
  }

  async function handleCustomFormSubmit(form: EntryFormValues) {
    setBusy(true)
    setError('')
    const res = await createEntry(client, {
      form,
      kind,
      example: form.useExample ? example : null,
    })
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    if (res.data) {
      if (res.data.existed && res.data.entry.kind !== kind) {
        setError(`Cette graphie existe déjà comme ${res.data.entry.kind === 'marker' ? 'marqueur grammatical' : 'mot'} : ${res.data.entry.spelling}.`)
        return
      }
      onLink(res.data.entry, kind === 'word' ? (res.data.senseIds[0] ?? null) : null)
    }
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
            <button type="button" className={btn} onClick={onUnlink}>Délier</button>
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
      ) : mode === 'create' ? (
        <EntryForm
          kind={kind}
          initial={emptyEntryForm(words, gloss, dialect)}
          canUseExample={example !== null}
          busy={busy}
          error={error}
          onSubmit={handleCustomFormSubmit}
          onCancel={() => setMode('choose')}
        />
      ) : (
        /* Not linked, mode choose */
        <div className="space-y-3">
          {candidates === null && (
            <p className="text-xs text-muted-foreground">Recherche dans le lexique…</p>
          )}

          {(() => {
            const grouped = groupCandidates(candidates ?? [], kind)
            const seed = senseSeed(gloss)
            const hasMore = (candidates?.length ?? 0) > 6
            const shownExact = grouped.exact.slice(0, 6)
            const shownVariants = grouped.variants.slice(0, Math.max(0, 6 - shownExact.length))

            return (
              <div className="space-y-3">
                {shownExact.map(c => {
                  const sel = candidateSenses[c.entry.id] ?? defaultSense(c.entry)
                  const hasExactFrench = c.entry.senses.some(s => s.french.toLowerCase() === seed.toLowerCase())
                  return (
                    <div key={c.entry.id} className="space-y-2 rounded-md border border-border p-2.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-bold">{c.entry.spelling}</span>
                        <span className="text-xs text-muted-foreground">({c.entry.dialect})</span>
                      </div>
                      {kind === 'word' && (
                        <div className="space-y-1">
                          {c.entry.senses.map(s => (
                            <label key={s.id} className="flex items-center gap-2 text-xs">
                              <input
                                type="radio"
                                name={`cand-sense-${c.entry.id}`}
                                checked={sel === s.id}
                                onChange={() => setCandidateSenses(prev => ({ ...prev, [c.entry.id]: s.id }))}
                              />
                              <span>{s.french}</span>
                            </label>
                          ))}
                          {seed && !hasExactFrench && (
                            <label className="flex items-center gap-2 text-xs font-medium">
                              <input
                                type="radio"
                                name={`cand-sense-${c.entry.id}`}
                                checked={sel === 'new'}
                                onChange={() => setCandidateSenses(prev => ({ ...prev, [c.entry.id]: 'new' }))}
                              />
                              <span>Nouveau sens : « {seed} »</span>
                            </label>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        className={`${btn} bg-primary text-primary-foreground`}
                        disabled={busy}
                        onClick={() => linkCandidate(c.entry, kind === 'word' ? sel : null)}
                      >
                        {kind === 'marker' ? 'Lier à ce marqueur' : 'Lier à cette entrée'}
                      </button>
                    </div>
                  )
                })}

                {shownVariants.map(c => {
                  const sel = candidateSenses[c.entry.id] ?? defaultSense(c.entry)
                  const hasExactFrench = c.entry.senses.some(s => s.french.toLowerCase() === seed.toLowerCase())
                  return (
                    <div key={c.entry.id} className="space-y-2 rounded-md border border-border p-2.5">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="text-sm font-bold">{c.entry.spelling}</span>
                          <span className="ml-2 text-xs text-muted-foreground">(variante de « {c.matched} »)</span>
                        </div>
                        <span className="text-xs text-muted-foreground">({c.entry.dialect})</span>
                      </div>
                      {kind === 'word' && (
                        <div className="space-y-1">
                          {c.entry.senses.map(s => (
                            <label key={s.id} className="flex items-center gap-2 text-xs">
                              <input
                                type="radio"
                                name={`var-sense-${c.entry.id}`}
                                checked={sel === s.id}
                                onChange={() => setCandidateSenses(prev => ({ ...prev, [c.entry.id]: s.id }))}
                              />
                              <span>{s.french}</span>
                            </label>
                          ))}
                          {seed && !hasExactFrench && (
                            <label className="flex items-center gap-2 text-xs font-medium">
                              <input
                                type="radio"
                                name={`var-sense-${c.entry.id}`}
                                checked={sel === 'new'}
                                onChange={() => setCandidateSenses(prev => ({ ...prev, [c.entry.id]: 'new' }))}
                              />
                              <span>Nouveau sens : « {seed} »</span>
                            </label>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        className={`${btn} bg-primary text-primary-foreground`}
                        disabled={busy}
                        onClick={() => linkVariant(c)}
                      >
                        C’est le même mot : ajouter la graphie « {words} » et lier
                      </button>
                    </div>
                  )
                })}

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
            )
          })()}

          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

          <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
            {kind === 'word' ? (
              <>
                <button type="button" className={btn} onClick={() => setMode('create')}>
                  Mot différent : créer l’entrée
                </button>
                <button type="button" className={btn} disabled={busy} onClick={handleCreateFast}>
                  Créer vite, avec le mot à mot seul
                </button>
              </>
            ) : (
              <button
                type="button"
                className={btn}
                disabled={busy}
                onClick={handleCreateMarkerImmediate}
              >
                Créer ce marqueur (sens à préciser plus tard)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
