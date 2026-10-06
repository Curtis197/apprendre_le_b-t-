'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase-browser'
import { useContributeRefresh } from '@/context/ContributeRefreshContext'
import { useDialect } from '@/context/DialectContext'
import { DIALECTS, DIALECT_KEYS, type DialectKey } from '@/lib/dialect'
import { ContributionPronunciation } from '@/components/ContributionPronunciation'
import { LexiconPicker } from '@/components/lexicon/LexiconPicker'
import { MarkdownField } from '@/components/MarkdownField'
import { uploadPronunciation } from '@/lib/lexicon-audio-data'
import {
  audioFailedMessage,
  contributionErrorMessage,
  exampleState,
  submitNewWord,
  wordBlockingProblem,
} from '@/lib/contribution'
import { createEntry } from '@/lib/lexicon-links-data'
import type { EntryForm as EntryFormValues } from '@/lib/lexicon-links'

type ContributionType = 'word' | 'expression' | 'grammar_rule'

interface ContributionFormProps {
  initialWord?: string
  initialType?: ContributionType
}

export function ContributionForm({ initialWord, initialType }: ContributionFormProps = {}) {
  const [type, setType] = useState<ContributionType>(initialType ?? 'word')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [client] = useState(() => createClient())
  const supabaseRef = useRef(client)
  const router = useRouter()
  const { bumpRefresh } = useContributeRefresh()
  // Same source of truth as the page-level DialectSelector, so the two never disagree.
  const { dialect, setDialect } = useDialect()

  // Word fields: the spelling drives the lexicon search; everything else lives in the shared creation form.
  const [wordSpelling, setWordSpelling] = useState('')
  const [wordExBete, setWordExBete] = useState('')
  const [wordExFrench, setWordExFrench] = useState('')
  // null until we know whether someone is signed in.
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  // The spelling already had an entry: nothing was created, say so and point to it.
  const [existing, setExisting] = useState<{ id: string; notice: string } | null>(null)
  // Optional recording kept in the browser until the entry exists, and what happened to it.
  const [pronunciation, setPronunciation] = useState<Blob | null>(null)
  const [recording, setRecording] = useState(false)
  const [audioFailedReason, setAudioFailedReason] = useState<string | null | undefined>(undefined) // undefined: no failure
  const [recorderKey, setRecorderKey] = useState(0)
  // The creation form is open: it owns the spelling and dialect, so the outer fields are hidden.
  const [creatingWord, setCreatingWord] = useState(false)

  // Grammar rule fields
  const [category, setCategory] = useState('verb')
  const [patternFr, setPatternFr] = useState('')
  const [patternBete, setPatternBete] = useState('')
  const [description, setDescription] = useState('')
  const [exFr, setExFr] = useState('')
  const [exBete, setExBete] = useState('')

  // Expression fields
  const [frPhrase, setFrPhrase] = useState('')
  const [frLiteral, setFrLiteral] = useState('')
  const [betePhrase, setBetePhrase] = useState('')
  const [betePhonetic, setBetePhonetic] = useState('')
  const [exprType, setExprType] = useState<'idiomatic' | 'fixed' | 'proverb'>('idiomatic')

  useEffect(() => {
    supabaseRef.current.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)))
  }, [])

  async function handleCreateWord(form: EntryFormValues) {
    const problem = wordBlockingProblem({ exampleBete: wordExBete, exampleFrench: wordExFrench, recording })
    if (problem) {
      setSubmitError(problem)
      return
    }
    setLoading(true)
    setSubmitError(null)
    setAudioFailedReason(undefined)
    setExisting(null)
    try {
      const { data: { user } } = await supabaseRef.current.auth.getUser()
      if (!user) {
        alert('Connectez-vous pour contribuer.')
        return
      }
      const client = supabaseRef.current
      const result = await submitNewWord({
        create: () => createEntry(client, {
          form,
          kind: 'word',
          example: exampleState(wordExBete, wordExFrench) === 'complete'
            ? { bete: wordExBete.trim(), french: wordExFrench.trim(), literal: '' }
            : null,
        }),
        upload: pronunciation
          ? async id => {
              const r = await uploadPronunciation(client, { userId: user.id, lexiconId: id, blob: pronunciation })
              return { error: r.error }
            }
          : null,
      })
      if (result.type === 'error') {
        setSubmitError(result.message)
        return
      }
      if (result.type === 'existing') {
        setExisting({ id: result.id, notice: result.notice })
        return
      }
      if (result.audioFailedReason !== undefined) setAudioFailedReason(result.audioFailedReason)
      setSubmitted(true)
      bumpRefresh()
      router.refresh()
    } catch (e) {
      setSubmitError(contributionErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit() {
    setLoading(true)
    setSubmitError(null)
    const { data: { user } } = await supabaseRef.current.auth.getUser()
    if (!user) {
      setLoading(false)
      alert('Connectez-vous pour contribuer.')
      return
    }
    try {
      let error
      if (type === 'grammar_rule') {
        ({ error } = await supabaseRef.current.from('grammar_rules').insert({
          category, pattern_french: patternFr, pattern_bete: patternBete,
          description, example_french: exFr || null, example_bete: exBete || null,
          created_by: user.id,
        }))
      } else {
        ({ error } = await supabaseRef.current.from('expressions').insert({
          french_phrase: frPhrase,
          french_literal: frLiteral.trim() || null,
          bete_phrase: betePhrase,
          bete_phonetic: betePhonetic,
          type: exprType,
          created_by: user.id,
        }))
      }
      if (error) throw error
      setSubmitted(true)
      bumpRefresh()
      router.refresh()
    } catch (e) {
      setSubmitError(contributionErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  if (submitted) return (
    <div className="p-4 border rounded text-center space-y-2">
      <p className="font-semibold">Contribution envoyée ✓</p>
      <p className="text-sm text-muted-foreground">Elle est déjà disponible pour la communauté.</p>
      {audioFailedReason !== undefined && (
        <p className="text-sm text-red-600">{audioFailedMessage(audioFailedReason)}</p>
      )}
      <Button
        variant="outline"
        onClick={() => {
          // A stale sentence would attach itself to the next word.
          setWordSpelling('')
          setExisting(null)
          setWordExBete('')
          setWordExFrench('')
          setPronunciation(null)
          setAudioFailedReason(undefined)
          setRecorderKey(k => k + 1)
          setCreatingWord(false)
          setSubmitted(false)
        }}
      >
        Ajouter une autre
      </Button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(['word', 'expression', 'grammar_rule'] as ContributionType[]).map(t => (
          <Button
            key={t}
            variant={type === t ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setType(t); setExisting(null); setSubmitError(null); setCreatingWord(false); setPronunciation(null); setRecorderKey(k => k + 1) }}
          >
            {t === 'word' ? 'Mot du lexique' : t === 'expression' ? 'Expression' : 'Règle grammaticale'}
          </Button>
        ))}
      </div>

      {type === 'word' ? (
        <div className="space-y-3">
          {!creatingWord && (
            <>
            <div className="space-y-1">
              <label
                htmlFor="contribution-dialect"
                className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Dialecte de cette contribution
              </label>
              <select
                id="contribution-dialect"
                className="w-full border rounded px-3 py-2 text-sm"
                value={dialect}
                onChange={e => setDialect(e.target.value as DialectKey)}
              >
                {DIALECT_KEYS.map(key => (
                  <option key={key} value={key}>{DIALECTS[key].name}</option>
                ))}
              </select>
            </div>
            {initialWord && (
              <p className="text-xs text-muted-foreground">Mot français : « {initialWord} »</p>
            )}
            <Input
              placeholder="Mot en bhété (forme phonétique latine) *"
              value={wordSpelling}
              onChange={e => { setWordSpelling(e.target.value); setExisting(null); setSubmitError(null) }}
            />
            </>
          )}
          {signedIn === false && (
            <p className="text-sm text-muted-foreground">Connectez-vous pour contribuer.</p>
          )}
          {signedIn && (
            <LexiconPicker
              client={client}
              kind="word"
              spelling={wordSpelling}
              gloss={initialWord ?? ''}
              dialect={dialect}
              signedIn
              debounceMs={300}
              canUseExample={false}
              chooseSense={false}
              exactLabel="Ouvrir cette fiche"
              variantLabel="Ouvrir cette fiche"
              createLabel="Mon mot n’est pas dans la liste : créer l’entrée"
              submitLabel="Créer l’entrée"
              busy={loading}
              error={submitError ?? ''}
              onChoose={c => router.push(`/lexicon/${c.entry.id}`)}
              onChooseVariant={c => router.push(`/lexicon/${c.entry.id}`)}
              onCreate={handleCreateWord}
              onCreatingChange={setCreatingWord}
              formExtra={
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Phrase d&apos;exemple (optionnel)
                    </p>
                    <Input
                      placeholder="Phrase en bhété utilisant ce mot"
                      value={wordExBete}
                      onChange={e => setWordExBete(e.target.value)}
                    />
                    <Input
                      placeholder="Traduction française de la phrase"
                      value={wordExFrench}
                      onChange={e => setWordExFrench(e.target.value)}
                    />
                  </div>
                  <ContributionPronunciation key={recorderKey} blob={pronunciation} onChange={setPronunciation} onRecordingChange={setRecording} disabled={loading} />
                </>
              }
            />
          )}
          {existing && (
            <div className="rounded-md border border-amber-500/40 bg-amber-50/50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200" role="status">
              <p>{existing.notice}</p>
              <Link href={`/lexicon/${existing.id}`} className="font-semibold underline">Ouvrir la fiche</Link>
            </div>
          )}
        </div>
      ) : type === 'expression' ? (
        <div className="space-y-3">
          <Input
            placeholder="Phrase en bhété (standard) *"
            value={betePhrase}
            onChange={e => setBetePhrase(e.target.value)}
          />
          <Input
            placeholder="Forme phonétique *"
            value={betePhonetic}
            onChange={e => setBetePhonetic(e.target.value)}
          />
          <Input
            placeholder="Traduction littérale mot par mot (ex : la pluie me bat)"
            value={frLiteral}
            onChange={e => setFrLiteral(e.target.value)}
          />
          <Input
            placeholder="Sens réel en français (ex : il pleut) *"
            value={frPhrase}
            onChange={e => setFrPhrase(e.target.value)}
          />
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={exprType}
            onChange={e => setExprType(e.target.value as typeof exprType)}
          >
            <option value="idiomatic">Idiomatique</option>
            <option value="fixed">Expression figée</option>
            <option value="proverb">Proverbe</option>
          </select>
        </div>
      ) : (
        <div className="space-y-3">
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            <option value="verb">Verbe</option>
            <option value="noun">Nom</option>
            <option value="tense">Temps</option>
            <option value="agreement">Accord</option>
            <option value="other">Autre</option>
          </select>
          <Input placeholder="Patron français (ex: verbe + é)" value={patternFr} onChange={e => setPatternFr(e.target.value)} />
          <Input placeholder="Patron bhété correspondant" value={patternBete} onChange={e => setPatternBete(e.target.value)} />
          <MarkdownField
            id="rule-description"
            placeholder="Description de la règle (Markdown possible : **gras**, listes…)"
            value={description}
            onChange={setDescription}
            rows={6}
            maxLength={5000}
          />
          <Input placeholder="Exemple français (optionnel)" value={exFr} onChange={e => setExFr(e.target.value)} />
          <Input placeholder="Exemple bhété (optionnel)" value={exBete} onChange={e => setExBete(e.target.value)} />
        </div>
      )}

      {type !== 'word' && submitError && <p className="text-sm text-red-600">{submitError}</p>}

      {type !== 'word' && (
        <Button
          onClick={handleSubmit}
          disabled={loading || (
            type === 'expression' ? !frPhrase || !betePhrase || !betePhonetic :
            !patternFr || !patternBete || !description
          )}
        >
          {loading ? 'Envoi…' : 'Soumettre la contribution'}
        </Button>
      )}
    </div>
  )
}

function ContributionFormParamsReader() {
  const params = useSearchParams()
  const word = params.get('word') ?? undefined
  const rawType = params.get('type')
  const type: ContributionType | undefined =
    rawType === 'word' || rawType === 'expression' || rawType === 'grammar_rule'
      ? rawType
      : undefined
  return <ContributionForm initialWord={word} initialType={type} />
}

export function ContributionFormWithParams() {
  return (
    <Suspense fallback={<div className="h-48 bg-muted animate-pulse rounded-xl" />}>
      <ContributionFormParamsReader />
    </Suspense>
  )
}
